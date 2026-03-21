"""Orchestrator Agent - Gemini 3.1 Pro Preview via Google Gen AI SDK.

This is the user-facing conversational agent. It:
1. Chats with the user to understand dataset requirements
2. Generates a structured data collection plan
3. Presents the plan for user approval (via LangGraph interrupt)
4. Coordinates sub-agent execution after approval
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from google import genai
from google.genai import types
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.types import interrupt

from app.config import settings
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
You converse with the user to understand their dataset needs, then create a structured plan for data collection. After the user approves the plan, you coordinate execution by calling the appropriate sub-agents.

## Available Sub-Agents (use these as tool calls)
1. **compliance** - Checks legality of scraping a source, verifies budget. MUST be called before any scraping or payment action.
2. **script_writer** - Generates Python scraping scripts for APIs and websites.
3. **web_crawler** - Autonomous browser agent that can navigate pages, click buttons, fill forms, and extract data from dynamic websites.
4. **synthetic_generator** - Generates synthetic/simulated data when real data is unavailable.
5. **normalizer** - Transforms and normalizes raw data into a target schema.
6. **validator** - Validates dataset quality, completeness, and coverage.

## Planning Phase
During planning, ask the user about:
- What data they need (type, schema, columns)
- Data sources (specific sites/APIs, or let you decide)
- Volume (how many rows, time range)
- Output format (CSV, JSON, Parquet)
- Budget for external data costs (the budget does NOT include LLM costs, only external data purchases)

Then generate a plan as a JSON object with this structure:
{
  "plan_id": "<uuid>",
  "description": "<one-line summary>",
  "steps": [
    {"step": 1, "agent": "<agent_name>", "action": "<action>", "params": {...}},
    ...
  ],
  "estimated_cost": 0.00,
  "data_sources": ["<source1>", ...],
  "output_format": "csv"
}

When you have enough information, present the plan and ask for approval.

## Execution Phase
After plan approval, execute each step by calling the corresponding sub-agent tool. Always call compliance before scraping. After data collection, always normalize then validate.

## Budget Rules
- The user's budget covers ONLY external data costs (API fees, paid content), NOT LLM inference costs.
- Always check budget via the compliance agent before any paid action.
- If budget is $0, only use free sources.

## Important
- Be concise and helpful.
- For financial data, suggest well-known free sources first: Yahoo Finance, Alpha Vantage (free tier), FRED, SEC EDGAR.
- Always include compliance, normalization, and validation steps in plans.
"""


def _build_tools() -> list[types.Tool]:
    """Define the function-calling tools for routing to sub-agents."""
    declarations = [
        types.FunctionDeclaration(
            name="call_compliance",
            description="Check legality and budget for a data source or action",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "source": {"type": "string", "description": "URL or name of data source"},
                    "action": {"type": "string", "description": "What action to check (scrape, purchase, api_call)"},
                    "estimated_cost": {"type": "number", "description": "Estimated cost in USD"},
                },
                "required": ["source", "action"],
            },
        ),
        types.FunctionDeclaration(
            name="call_script_writer",
            description="Generate a Python scraping/data-collection script",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "source": {"type": "string", "description": "Target URL or API"},
                    "target_data": {"type": "string", "description": "What data to collect"},
                    "output_schema": {"type": "object", "description": "Expected output columns/types"},
                    "params": {"type": "object", "description": "Additional params like ticker, date range"},
                },
                "required": ["source", "target_data"],
            },
        ),
        types.FunctionDeclaration(
            name="call_web_crawler",
            description="Use browser automation to navigate a website and extract data",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Starting URL"},
                    "task_description": {"type": "string", "description": "What to do on the site"},
                    "extract_schema": {"type": "object", "description": "What data to extract"},
                },
                "required": ["url", "task_description"],
            },
        ),
        types.FunctionDeclaration(
            name="call_synthetic_generator",
            description="Generate synthetic dataset",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "schema": {"type": "object", "description": "Column names and types"},
                    "row_count": {"type": "integer", "description": "Number of rows to generate"},
                    "domain_context": {"type": "string", "description": "Domain context for realistic data"},
                    "statistical_properties": {"type": "object", "description": "Distributions, correlations"},
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
                    "input_dataset_id": {"type": "string", "description": "ID of dataset to normalize"},
                    "target_schema": {"type": "object", "description": "Target column names/types"},
                    "operations": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Operations: rename, cast, dedup, fill_nulls",
                    },
                },
                "required": ["input_dataset_id", "target_schema"],
            },
        ),
        types.FunctionDeclaration(
            name="call_validator",
            description="Validate a dataset for quality and completeness",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "input_dataset_id": {"type": "string", "description": "ID of dataset to validate"},
                    "checks": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Checks: completeness, schema_match, no_nulls, statistical_sanity, coverage",
                    },
                    "expected_row_count": {"type": "integer", "description": "Expected number of rows"},
                    "use_case": {"type": "string", "description": "What the data will be used for"},
                },
                "required": ["input_dataset_id", "checks"],
            },
        ),
        types.FunctionDeclaration(
            name="present_plan",
            description="Present a data collection plan to the user for approval",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "plan": {"type": "object", "description": "The full plan object"},
                },
                "required": ["plan"],
            },
        ),
        types.FunctionDeclaration(
            name="finish",
            description="Mark the run as complete. Call this when all plan steps are done.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "Summary of what was accomplished"},
                },
                "required": ["summary"],
            },
        ),
    ]
    return [types.Tool(function_declarations=declarations)]


def _normalize_tool_args(args: Any) -> dict[str, Any]:
    """Convert SDK function-call args into plain dicts for LangChain state."""
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
    """Flatten LangChain message content into plain text for Gemini."""
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
            if isinstance(item, dict):
                text = item.get("text")
                if text:
                    parts.append(str(text))
                continue
            text = getattr(item, "text", None)
            if text:
                parts.append(str(text))
        return "\n".join(parts)
    return str(content)


def _text_parts(content: Any) -> list[types.Part]:
    """Build Gemini text parts from a LangChain message content payload."""
    text = _message_content_to_text(content).strip()
    if not text:
        return []
    return [types.Part.from_text(text=text)]


def _message_to_genai_content(message: Any) -> types.Content | None:
    """Convert LangChain messages stored in state into Google Gen AI contents."""
    if isinstance(message, SystemMessage):
        return None

    if isinstance(message, HumanMessage):
        parts = _text_parts(message.content)
        if not parts:
            return None
        return types.Content(role="user", parts=parts)

    if not isinstance(message, AIMessage):
        return None

    tool_name = TOOL_RESPONSE_MAP.get(message.name or "")
    if tool_name and not message.tool_calls:
        return types.Content(
            role="tool",
            parts=[
                types.Part.from_function_response(
                    name=tool_name,
                    response={"content": _message_content_to_text(message.content)},
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

    if not parts:
        return None

    return types.Content(role="model", parts=parts)


def _extract_tool_call(response: AIMessage) -> tuple[str | None, dict | None]:
    """Extract the first tool call from an AI response, if any."""
    if not response.tool_calls:
        return None, None

    tool_call = response.tool_calls[0]
    return tool_call["name"], tool_call["args"]


def _response_to_ai_message(response: Any) -> AIMessage:
    """Convert a Google Gen AI response into the LangChain message shape the graph expects."""
    try:
        content = response.text or ""
    except Exception:
        content = ""

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

    return AIMessage(content=content, tool_calls=tool_calls)


async def orchestrator_node(state: DataCrawlState) -> dict:
    """The orchestrator LangGraph node."""
    budget_ctx = (
        f"\n\nProject context:\n"
        f"- External-cost budget: ${state.get('budget_total', 0):.2f}\n"
        f"- External costs spent so far: ${state.get('budget_spent', 0):.2f}"
    )

    contents = []
    for message in state.get("messages", []):
        converted = _message_to_genai_content(message)
        if converted is not None:
            contents.append(converted)

    async with genai.Client(api_key=settings.GOOGLE_API_KEY).aio as client:
        sdk_response = await client.models.generate_content(
            model=ORCHESTRATOR_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=f"{ORCHESTRATOR_SYSTEM_PROMPT}{budget_ctx}",
                temperature=0.7,
                tools=_build_tools(),
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    disable=True
                ),
            ),
        )

    response = _response_to_ai_message(sdk_response)
    tool_name, tool_args = _extract_tool_call(response)
    now = datetime.now(timezone.utc).isoformat()

    # Present plan for approval
    if tool_name == "present_plan":
        plan = (tool_args or {}).get("plan", {})
        if not plan.get("plan_id"):
            plan["plan_id"] = str(uuid.uuid4())

        user_decision = interrupt({
            "type": "plan_approval",
            "plan": plan,
            "message": "Please review this data collection plan. Reply with 'approve' to proceed or describe changes you'd like.",
        })

        if isinstance(user_decision, dict) and user_decision.get("approved"):
            return {
                "plan": plan,
                "plan_approved": True,
                "status": "running",
                "messages": [
                    response,
                    AIMessage(content="Plan approved! Starting data collection..."),
                ],
                "agent_logs": [{
                    "agent": "orchestrator",
                    "action": "plan_approved",
                    "status": "completed",
                    "summary": f"Plan approved: {plan.get('description', '')}",
                    "timestamp": now,
                }],
            }

        feedback = (
            user_decision.get("feedback", "User requested changes")
            if isinstance(user_decision, dict)
            else str(user_decision)
        )
        return {
            "plan": None,
            "plan_approved": False,
            "messages": [response, HumanMessage(content=feedback)],
            "agent_logs": [{
                "agent": "orchestrator",
                "action": "plan_revision_requested",
                "status": "completed",
                "summary": f"User requested plan changes: {feedback}",
                "timestamp": now,
            }],
        }

    # Route to sub-agent
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
        return {
            "current_agent": target_agent,
            "current_task": tool_args,
            "messages": [response],
            "agent_logs": [{
                "agent": "orchestrator",
                "action": f"delegate_to_{target_agent}",
                "status": "completed",
                "summary": f"Routing task to {target_agent}",
                "timestamp": now,
            }],
        }

    # Finish
    if tool_name == "finish":
        return {
            "status": "completed",
            "messages": [response],
            "agent_logs": [{
                "agent": "orchestrator",
                "action": "finish",
                "status": "completed",
                "summary": (tool_args or {}).get("summary", "Run completed"),
                "timestamp": now,
            }],
        }

    # Conversational response (no tool call)
    return {
        "messages": [response],
        "agent_logs": [{
            "agent": "orchestrator",
            "action": "respond",
            "status": "completed",
            "summary": response.content[:200] if response.content else "",
            "timestamp": now,
        }],
    }
