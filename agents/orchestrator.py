"""Orchestrator Agent using Google Gemini function calling."""

from __future__ import annotations

import base64
import json
import uuid
from typing import Any

from google import genai
from google.genai import types
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.config import settings
from app.services.run_control import finish_agent_log, run_cancellable, start_agent_log
from agents.llm_utils import LLMServiceError, describe_exception
from agents.state import DataCrawlState

ORCHESTRATOR_MODEL = "gemini-3.1-pro-preview"
TOOL_RESPONSE_MAP = {
    "compliance": "call_compliance",
    "script_writer": "call_script_writer",
    "web_crawler": "call_web_crawler",
    "synthetic_generator": "call_synthetic_generator",
    "normalizer": "call_normalizer",
    "validator": "call_validator",
}

ORCHESTRATOR_SYSTEM_PROMPT = """You are the DataCrawl Orchestrator, an AI that helps users create datasets for financial analysis, trading, research, and machine learning.

## Your Role
You ONLY handle financial-data requests. Your job is to discover where the requested financial data can be found on the internet, determine whether it is feasible within budget, and build a complete execution plan that can run with minimal human intervention after approval.

If the request is not about financial data, do not attempt to satisfy it. Briefly explain that DataCrawl currently only supports financial data collection and ask the user to restate their request in financial-data terms.

Your plan must be detailed and executable. Do not present vague tool-only plans.

## Available Sub-Agents (use these as tool calls)
1. **compliance** - Reviews financial-data source legality, licensing, budget fit, and pricing provenance. Paid providers must be justified against free alternatives.
2. **script_writer** - Implements precise extraction scripts. It is not responsible for source discovery.
3. **web_crawler** - Performs browser reconnaissance, account setup, API key retrieval, and browser-based extraction when APIs are unavailable.
4. **synthetic_generator** - Generates synthetic data ONLY when the plan explicitly allows this fallback.
5. **normalizer** - Applies schema cleanup only. It must not invent semantic financial data.
6. **validator** - Strictly verifies schema, expected row-count range, and extraction quality. If validation fails, use its repair instructions to revise the script before asking the user for help.

## Planning Phase
During planning, gather or infer:
- the exact financial dataset requested
- the exact fields/columns required
- the exact time range and granularity
- the exact entities/symbols required
- the target row count and acceptable row-count range
- which sources can realistically satisfy the request
- all account, API-key, and payment prerequisites
- the exact external-cost budget and whether it is sufficient

## Handling Changed Instructions
- Users are allowed to change their mind at any point.
- Treat the latest user instruction as an override whenever it directly conflicts with an earlier target, such as row count, symbols, entities, time range, source choice, or budget.
- Treat the latest user instruction as supplementary only when it adds detail without contradicting the current plan.
- If a newer instruction overrides an earlier requirement, stop optimizing for the superseded target immediately. Do not continue planning or executing toward the old row count, source, schema, or scope.
- When an earlier approved plan is no longer aligned with the latest user instruction, rebuild the plan from the new intent before continuing.

You MAY call compliance and web_crawler during planning to verify source feasibility, auth requirements, pricing, and live provider details before proposing the plan.

When you have enough information, generate a detailed plan JSON with this structure:
{
  "plan_id": "<uuid>",
  "description": "<one-line summary>",
  "financial_request_summary": "<user request restated precisely>",
  "output_contract": {
    "format": "csv",
    "required_columns": [],
    "optional_columns": [],
    "row_count_target": 0,
    "row_count_range": {"min": 0, "max": 0},
    "time_range": "",
    "granularity": "",
    "symbols_or_entities": []
  },
  "source_strategy": [
    {
      "provider": "",
      "source_mode": "api_code|web_scraping",
      "endpoint_or_url": "",
      "why_selected": "",
      "requires_account": false,
      "requires_api_key": false,
      "requires_paid_plan": false,
      "free_vs_paid_rank": "preferred_free|fallback_free|last_resort_paid"
    }
  ],
  "budget_analysis": {
    "budget_total": 0,
    "estimated_total_cost": 0,
    "within_budget": true,
    "line_items": [
      {
        "provider": "",
        "kind": "",
        "estimated_cost": 0,
        "calculation": "",
        "pricing_source": ""
      }
    ]
  },
  "user_inputs_required": [],
  "steps": [
    {
      "id": "",
      "agent": "",
      "goal": "",
      "inputs": {},
      "expected_outputs": [],
      "success_criteria": [],
      "fallback_step_ids": [],
      "estimated_cost": 0
    }
  ],
  "risks_and_fallbacks": [],
  "synthetic_data_usage": {"allowed": false, "reason": ""},
  "approval_gate_summary": {"approvable": true, "reason": ""}
}

If any paid provider may be necessary, include:
{
  "paid_execution_notice": {
    "may_require_paid_approval": true,
    "candidate_paid_providers": [],
    "expected_price_range": "",
    "manual_checkout_required": true,
    "supported_payment_methods": ["stripe"]
  }
}

If a provider can be settled with a verifiable USDC-on-Solana payment, you may include Solana alongside Stripe:
- set `supported_payment_methods` to include `"solana"`
- include `solana_payment_request` with at least:
  - `recipient`
  - `amount`
  - optionally `network`, `mint`, `memo`, `reference`, `label`, and `message`
- only include Solana when that provider step can actually be resumed after a verifiable wallet payment
- if the provider only supports a manual card checkout, leave Solana out

When you have enough information, call `present_plan`.

## Execution Phase
If `plan_approved` is true, do not present a new plan unless the user explicitly asked for replanning or a paid step was declined. Continue execution from the approved plan, one step at a time.

During execution:
- Use free sources whenever possible. Paid providers are a last resort.
- Before any paid provider signup or purchase step, request an explicit paid approval.
- If validator failure occurs, retry script_writer with structured repair context up to two times before pausing for user help.
- If synthetic generation or validation reveals that the current target is no longer aligned with the latest user instruction, update the execution path to match the new target instead of repeating the old one.
- Do not repeat the same failing generation or validation loop for the same plan step without materially changing the scope, method, or target.
- If a service needs account info, API keys, OTPs, or credentials, request structured user input and pause.

## Important
- Be concise and helpful.
- For financial data, suggest well-known free sources first: Yahoo Finance, Alpha Vantage (free tier), FRED, SEC EDGAR.
- Prefer API/code sourcing over web scraping whenever a usable API or structured endpoint exists.
- Do not recommend a paid provider unless you can explain why free options are insufficient.
- If a plan is over budget, say so before presenting it as approvable and show the budget calculations and sources.
- The user should be able to see where each budget calculation came from.
- Paid provider steps require a second approval during execution with the exact live price at that moment.
- Always include compliance and validation in plans. Include normalization only if it is actually needed to satisfy the schema contract.
"""


def _build_tools(generation_mode: str = "real") -> list[types.Tool]:
    declarations = [
        types.FunctionDeclaration(
            name="call_compliance",
            description="Review a financial-data source for cost, licensing, auth requirements, and compliance. Prefer free options. Paid options must be justified against free alternatives.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "source": {"type": "string"},
                    "candidate_source": {"type": "string"},
                    "action": {"type": "string"},
                    "estimated_cost": {"type": "number"},
                    "source_mode": {
                        "type": "string",
                        "enum": ["api_code", "web_scraping"],
                    },
                    "api_available": {"type": "boolean"},
                    "requires_account": {"type": "boolean"},
                    "requires_api_key": {"type": "boolean"},
                    "requires_paid_plan": {"type": "boolean"},
                    "estimated_requests": {"type": "number"},
                    "estimated_subscription_cost": {"type": "number"},
                    "pricing_source": {"type": "string"},
                    "free_alternatives_considered": {"type": "array", "items": {"type": "string"}},
                    "cost_notes": {"type": "string"},
                },
                "required": ["source", "action", "source_mode"],
            },
        ),
        types.FunctionDeclaration(
            name="call_script_writer",
            description="Generate or repair a precise financial-data extraction script using a preselected source.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "source": {"type": "string"},
                    "target_data": {"type": "string"},
                    "source_details": {"type": "object"},
                    "constraints": {"type": "object"},
                    "required_columns": {"type": "array", "items": {"type": "string"}},
                    "row_count_target": {"type": "integer"},
                    "row_count_range": {"type": "object"},
                    "time_range": {"type": "string"},
                    "symbols": {"type": "array", "items": {"type": "string"}},
                    "auth_requirements": {"type": "object"},
                    "output_schema": {"type": "object"},
                    "output_contract": {"type": "object"},
                    "params": {"type": "object"},
                    "repair_context": {"type": "object"},
                    "plan_step_id": {"type": "string"},
                },
                "required": ["source", "target_data"],
            },
        ),
        types.FunctionDeclaration(
            name="call_synthetic_generator",
            description="Generate synthetic dataset",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "schema": {"type": "object"},
                    "row_count": {"type": "integer"},
                    "domain_context": {"type": "string"},
                    "statistical_properties": {"type": "object"},
                },
                "required": ["schema", "row_count", "domain_context"],
            },
        ),
        types.FunctionDeclaration(
            name="call_normalizer",
            description="Normalize/transform raw data into target schema",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "input_dataset_id": {"type": "string"},
                    "target_schema": {"type": "object"},
                    "operations": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["input_dataset_id", "target_schema"],
            },
        ),
        types.FunctionDeclaration(
            name="call_validator",
            description="Validate a dataset against a strict financial-data contract, including schema and row-count range.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "input_dataset_id": {"type": "string"},
                    "checks": {"type": "array", "items": {"type": "string"}},
                    "expected_row_count": {"type": "integer"},
                    "expected_schema": {"type": "object"},
                    "required_columns": {"type": "array", "items": {"type": "string"}},
                    "row_count_target": {"type": "integer"},
                    "row_count_range": {"type": "object"},
                    "strict_schema": {"type": "boolean"},
                    "repair_attempt": {"type": "integer"},
                    "use_case": {"type": "string"},
                    "plan_step_id": {"type": "string"},
                },
                "required": ["input_dataset_id", "checks"],
            },
        ),
        types.FunctionDeclaration(
            name="request_user_input",
            description="Pause the run and request structured user input such as API keys, credentials, OTPs, or account information.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "request": {"type": "object"},
                    "summary": {"type": "string"},
                },
                "required": ["request"],
            },
        ),
        types.FunctionDeclaration(
            name="request_paid_approval",
            description="Pause the run before a paid-provider step and request explicit user approval with the exact live price and compatible payment methods such as Stripe or verifiable USDC on Solana.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "approval": {"type": "object"},
                    "summary": {"type": "string"},
                },
                "required": ["approval"],
            },
        ),
        types.FunctionDeclaration(
            name="present_plan",
            description="Present a data collection plan to the user for approval",
            parameters_json_schema={
                "type": "object",
                "properties": {"plan": {"type": "object"}},
                "required": ["plan"],
            },
        ),
        types.FunctionDeclaration(
            name="finish",
            description="Mark the run as complete. Call this when all plan steps are done.",
            parameters_json_schema={
                "type": "object",
                "properties": {"summary": {"type": "string"}},
                "required": ["summary"],
            },
        ),
    ]
    if generation_mode != "synthetic":
        declarations.insert(
            2,
            types.FunctionDeclaration(
                name="call_web_crawler",
                description="Use browser automation for provider reconnaissance, account setup, API-key retrieval, or browser-based extraction.",
                parameters_json_schema={
                    "type": "object",
                    "properties": {
                        "url": {"type": "string"},
                        "mode": {"type": "string", "enum": ["recon", "account_setup", "extract"]},
                        "provider": {"type": "string"},
                        "goal": {"type": "string"},
                        "auth_goal": {"type": "string"},
                        "task_description": {"type": "string"},
                        "extract_schema": {"type": "object"},
                        "required_user_inputs": {"type": "array", "items": {"type": "object"}},
                        "paid_context": {"type": "object"},
                        "plan_step_id": {"type": "string"},
                    },
                    "required": ["url", "task_description"],
                },
            ),
        )
    return [types.Tool(function_declarations=declarations)]


def _normalize_tool_args(args: Any) -> dict[str, Any]:
    if args is None:
        return {}
    if isinstance(args, dict):
        return args
    if hasattr(args, "model_dump"):
        return args.model_dump()
    try:
        return dict(args)
    except Exception:
        return {"value": args}


def _message_content_to_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            if isinstance(item, dict) and item.get("text"):
                parts.append(str(item["text"]))
                continue
            text = getattr(item, "text", None)
            if text:
                parts.append(str(text))
        return "\n".join(parts)
    return str(content)


def _text_parts(content: Any) -> list[types.Part]:
    text = _message_content_to_text(content).strip()
    return [types.Part.from_text(text=text)] if text else []


def _serialize_part(part: Any) -> dict[str, Any]:
    if hasattr(part, "model_dump"):
        data = part.model_dump()
    elif isinstance(part, dict):
        data = dict(part)
    else:
        data = {}

    thought_signature = data.get("thought_signature")
    if isinstance(thought_signature, (bytes, bytearray)):
        data["thought_signature"] = base64.b64encode(thought_signature).decode("ascii")

    return data


def _deserialize_part(data: dict[str, Any]) -> types.Part:
    payload = dict(data)
    thought_signature = payload.get("thought_signature")
    if isinstance(thought_signature, str):
        try:
            payload["thought_signature"] = base64.b64decode(thought_signature)
        except Exception:
            payload.pop("thought_signature", None)
    return types.Part.model_validate(payload)


def _build_content_from_raw(raw_content: dict[str, Any] | None) -> types.Content | None:
    if not raw_content:
        return None

    role = raw_content.get("role", "model")
    parts = [_deserialize_part(part) for part in raw_content.get("parts", [])]
    if not parts:
        return None
    return types.Content(role=role, parts=parts)


def _message_to_genai_content(message: Any) -> types.Content | None:
    if isinstance(message, SystemMessage):
        return None

    if isinstance(message, HumanMessage):
        parts = _text_parts(message.content)
        return types.Content(role="user", parts=parts) if parts else None

    if not isinstance(message, AIMessage):
        return None

    raw_content = message.additional_kwargs.get("genai_content")
    preserved = _build_content_from_raw(raw_content)
    if preserved is not None:
        return preserved

    tool_name = TOOL_RESPONSE_MAP.get(message.name or "")
    if tool_name and not message.tool_calls:
        return types.Content(
            role="user",
            parts=[
                types.Part.from_function_response(
                    name=tool_name,
                    response={"result": _message_content_to_text(message.content)},
                )
            ],
        )

    parts = _text_parts(message.content)
    for tool_call in message.tool_calls:
        name = tool_call.get("name")
        if not name:
            continue
        parts.append(
            types.Part.from_function_call(
                name=name,
                args=_normalize_tool_args(tool_call.get("args")),
            )
        )

    return types.Content(role="model", parts=parts) if parts else None


def _response_to_ai_message(response: Any) -> AIMessage:
    candidate_content = None
    candidates = getattr(response, "candidates", None) or []
    if candidates:
        candidate_content = getattr(candidates[0], "content", None)

    try:
        content = response.text or ""
    except Exception:
        content = ""

    if not content and candidate_content is not None:
        text_parts: list[str] = []
        for part in getattr(candidate_content, "parts", []) or []:
            text = getattr(part, "text", None)
            if text:
                text_parts.append(str(text))
        content = "\n".join(text_parts)

    tool_calls = []
    for function_call in getattr(response, "function_calls", None) or []:
        name = getattr(function_call, "name", None)
        args = getattr(function_call, "args", None)
        nested_call = getattr(function_call, "function_call", None)
        if nested_call is not None:
            name = name or getattr(nested_call, "name", None)
            args = args or getattr(nested_call, "args", None)
        if name:
            tool_calls.append({
                "name": name,
                "args": _normalize_tool_args(args),
                "id": str(uuid.uuid4()),
                "type": "tool_call",
            })

    additional_kwargs: dict[str, Any] = {}
    if candidate_content is not None:
        additional_kwargs["genai_content"] = {
            "role": getattr(candidate_content, "role", "model"),
            "parts": [_serialize_part(part) for part in getattr(candidate_content, "parts", []) or []],
        }

    return AIMessage(content=content, tool_calls=tool_calls, additional_kwargs=additional_kwargs)


def _extract_tool_call(response: AIMessage) -> tuple[str | None, dict[str, Any] | None]:
    if not response.tool_calls:
        return None, None
    tool_call = response.tool_calls[0]
    return tool_call["name"], tool_call["args"]


async def _invoke_gemini(
    state: DataCrawlState,
    contents: list[types.Content],
    system_instruction: str,
    generation_mode: str,
) -> Any:
    if not settings.GOOGLE_API_KEY:
        raise LLMServiceError(
            provider="gemini",
            model=ORCHESTRATOR_MODEL,
            reason="missing_api_key",
            detail="GOOGLE_API_KEY is not configured.",
        )

    client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    try:
        async with client.aio as aio_client:
            return await run_cancellable(
                state["user_id"],
                state["project_id"],
                state["run_id"],
                aio_client.models.generate_content(
                    model=ORCHESTRATOR_MODEL,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.7,
                        tools=_build_tools(generation_mode),
                        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                    ),
                ),
            )
    except LLMServiceError:
        raise
    except Exception as exc:
        raise LLMServiceError(
            provider="gemini",
            model=ORCHESTRATOR_MODEL,
            reason="provider_error",
            detail=describe_exception(exc),
        ) from exc


async def orchestrator_node(state: DataCrawlState) -> dict[str, Any]:
    generation_mode = state.get("generation_mode", "real")
    plan_json = json.dumps(state.get("plan") or {}, default=str)
    latest_validation_json = json.dumps(state.get("last_validation_result") or {}, default=str)
    latest_script_json = json.dumps(state.get("last_script_task") or {}, default=str)
    retry_json = json.dumps(state.get("retry_counters") or {}, default=str)
    source_research_json = json.dumps(state.get("source_research") or [], default=str)
    budget_ctx = (
        f"\n\nProject context:\n"
        f"- generation_mode: {generation_mode}\n"
        f"- External-cost budget: ${state.get('budget_total', 0):.2f}\n"
        f"- External costs spent so far: ${state.get('budget_spent', 0):.2f}\n"
        f"- plan_approved: {state.get('plan_approved', False)}\n"
        f"- current_status: {state.get('status', '')}\n"
        f"- current_plan: {plan_json}\n"
        f"- latest_validation_result: {latest_validation_json}\n"
        f"- latest_script_task: {latest_script_json}\n"
        f"- retry_counters: {retry_json}\n"
        f"- source_research: {source_research_json}"
    )
    mode_ctx = (
        "\n\nRun guidance:\n"
        "- This is a synthetic-data run.\n"
        "- Treat the request as creating synthetic financial data, not collecting live web data.\n"
        "- Do not call the web_crawler agent or propose browser-based collection.\n"
        "- Keep the workflow similar to a normal run, but center the plan on synthetic generation, validation, and any needed cleanup.\n"
    ) if generation_mode == "synthetic" else ""

    contents: list[types.Content] = []
    for message in state.get("messages", []):
        converted = _message_to_genai_content(message)
        if converted is not None:
            contents.append(converted)

    log_id = start_agent_log(
        state["user_id"],
        state["project_id"],
        state["run_id"],
        agent_name="orchestrator",
        action="reason",
        summary="Reasoning about the next step",
        current_task=state.get("current_task"),
    )

    try:
        sdk_response = await _invoke_gemini(
            state,
            contents,
            f"{ORCHESTRATOR_SYSTEM_PROMPT}{mode_ctx}{budget_ctx}",
            generation_mode,
        )
        response = _response_to_ai_message(sdk_response)
        tool_name, tool_args = _extract_tool_call(response)

        if tool_name == "present_plan":
            plan = (tool_args or {}).get("plan", {})
            if not plan.get("plan_id"):
                plan["plan_id"] = str(uuid.uuid4())
            finish_agent_log(
                state["user_id"],
                state["project_id"],
                state["run_id"],
                log_id=log_id,
                status="completed",
                summary=f"Prepared plan with {len(plan.get('steps', []))} steps",
                details=plan,
                clear_current_task=True,
            )
            summary = response.content or "I have a plan ready for approval."
            return {
                "plan": plan,
                "plan_approved": False,
                "status": "awaiting_approval",
                "budget_analysis": plan.get("budget_analysis"),
                "plan_version": int(state.get("plan_version", 0) or 0) + 1,
                "messages": [response, AIMessage(content=summary)],
                "current_agent": "",
                "current_task": None,
                "pending_input_request": None,
                "pending_paid_approval": None,
            }

        if tool_name == "request_user_input":
            request_payload = dict((tool_args or {}).get("request", {}) or {})
            if not request_payload.get("request_id"):
                request_payload["request_id"] = str(uuid.uuid4())
            request_payload.setdefault("resume_phase", "execution" if state.get("plan_approved") else "planning")
            summary = (tool_args or {}).get("summary") or response.content or "Additional input is required before continuing."
            finish_agent_log(
                state["user_id"],
                state["project_id"],
                state["run_id"],
                log_id=log_id,
                status="completed",
                summary="Awaiting structured user input",
                details=request_payload,
                clear_current_task=True,
            )
            return {
                "status": "awaiting_user_input",
                "current_phase": "awaiting_user_input",
                "pending_input_request": request_payload,
                "pending_paid_approval": None,
                "messages": [response, AIMessage(content=summary)],
                "current_agent": "",
                "current_task": None,
            }

        if tool_name == "request_paid_approval":
            approval_payload = dict((tool_args or {}).get("approval", {}) or {})
            if not approval_payload.get("request_id"):
                approval_payload["request_id"] = str(uuid.uuid4())
            approval_payload.setdefault("resume_phase", "execution")
            approval_payload.setdefault("requires_manual_checkout", True)
            supported_methods = [
                str(item).strip().lower()
                for item in (approval_payload.get("supported_payment_methods") or ["stripe"])
                if str(item).strip()
            ]
            if approval_payload.get("solana_payment_request") and "solana" not in supported_methods:
                supported_methods.append("solana")
            approval_payload["supported_payment_methods"] = supported_methods or ["stripe"]
            summary = (tool_args or {}).get("summary") or response.content or "A paid provider requires your approval before execution can continue."
            finish_agent_log(
                state["user_id"],
                state["project_id"],
                state["run_id"],
                log_id=log_id,
                status="completed",
                summary="Awaiting paid approval",
                details=approval_payload,
                clear_current_task=True,
            )
            return {
                "status": "awaiting_paid_approval",
                "current_phase": "awaiting_paid_approval",
                "pending_paid_approval": approval_payload,
                "pending_input_request": None,
                "messages": [response, AIMessage(content=summary)],
                "current_agent": "",
                "current_task": None,
            }

        agent_map = {
            "call_compliance": "compliance",
            "call_script_writer": "script_writer",
            "call_web_crawler": "web_crawler",
            "call_synthetic_generator": "synthetic_generator",
            "call_normalizer": "normalizer",
            "call_validator": "validator",
        }

        if tool_name in agent_map:
            target_agent = agent_map[tool_name]
            finish_agent_log(
                state["user_id"],
                state["project_id"],
                state["run_id"],
                log_id=log_id,
                status="completed",
                summary=f"Delegating to {target_agent}",
                details=tool_args,
            )
            return {
                "current_agent": target_agent,
                "current_task": tool_args,
                "messages": [response],
                "active_plan_step_id": (tool_args or {}).get("plan_step_id"),
                "last_script_task": tool_args if target_agent == "script_writer" else state.get("last_script_task"),
            }

        if tool_name == "finish":
            finish_agent_log(
                state["user_id"],
                state["project_id"],
                state["run_id"],
                log_id=log_id,
                status="completed",
                summary=(tool_args or {}).get("summary", "Run completed"),
                clear_current_task=True,
            )
            return {
                "status": "completed",
                "messages": [response],
                "current_agent": "",
                "current_task": None,
            }

        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="completed",
            summary=(response.content or "Responded to the user")[:200],
            clear_current_task=True,
        )
        return {
            "messages": [response],
            "current_agent": "",
            "current_task": None,
        }
    except Exception as exc:
        error_detail = describe_exception(exc)
        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="failed",
            summary=f"Planning assistant failed: {error_detail}",
            details={"error": error_detail, "error_type": type(exc).__name__},
            clear_current_task=True,
        )
        raise
