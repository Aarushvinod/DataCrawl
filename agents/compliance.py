"""Compliance Agent — Together AI."""

import json
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.services.run_control import finish_agent_log, start_agent_log
from agents.llm_utils import TOGETHER_MODELS, invoke_together
from agents.state import DataCrawlState

COMPLIANCE_SYSTEM_PROMPT = """You are the DataCrawl Compliance Agent. Your job is to review the sourcing approach for a proposed data collection action.

## Review Rules
1. Strongly prefer free financial-data sources. Paid sources are a last resort and must be justified against free alternatives.
2. If `source_mode` is `api_code`, treat the sourcing method as compliant by definition. Focus on external data costs, pricing concerns, licensing, and auth requirements.
3. If `source_mode` is `web_scraping` and `api_available` is false, assess Terms of Service, robots.txt risk, rate limiting, licensing, and whether scraping is acceptable for the site.
4. If `source_mode` is `web_scraping` but `api_available` is true, warn that API/code should be preferred and explain why scraping is inferior.
5. Block only for clear budget overruns or clear scraping/TOS/licensing risk. Otherwise allow with warnings.
6. Every non-zero cost must include a pricing source or an explicit assumption string suitable for showing to the user.

## Response Format
Always respond with a JSON object with keys:
allowed, reason, recommended_delay_ms, estimated_cost, budget_fit, budget_gap, warnings, data_license, review_scope, pricing_source, cost_breakdown, requires_account, requires_api_key, requires_paid_plan, free_alternatives_considered, paid_option_justification, blocking_reasons.
"""


def _infer_source_mode(task: dict[str, Any]) -> str:
    explicit_mode = str(task.get("source_mode", "")).strip().lower()
    if explicit_mode in {"api_code", "web_scraping"}:
        return explicit_mode

    haystack = " ".join([
        str(task.get("source", "")),
        str(task.get("action", "")),
        json.dumps(task.get("params", {}), default=str),
    ]).lower()

    api_markers = ("api", "endpoint", "json", "csv download", "rest", "graphql", "fred", "alpha vantage")
    if any(marker in haystack for marker in api_markers):
        return "api_code"
    return "web_scraping"


def _infer_api_available(task: dict[str, Any], source_mode: str) -> bool:
    value = task.get("api_available")
    if isinstance(value, bool):
        return value
    return source_mode == "api_code"


async def compliance_node(state: DataCrawlState) -> dict:
    task = state.get("current_task", {})
    budget_total = state.get("budget_total", 0)
    budget_spent = state.get("budget_spent", 0)
    budget_remaining = budget_total - budget_spent
    source_mode = _infer_source_mode(task)
    api_available = _infer_api_available(task, source_mode)

    log_id = start_agent_log(
        state["user_id"],
        state["project_id"],
        state["run_id"],
        agent_name="compliance",
        action="compliance_check",
        summary=f"Checking {source_mode} compliance for {task.get('source', 'unknown source')}",
        current_task={**task, "source_mode": source_mode, "api_available": api_available},
    )

    messages = [
        SystemMessage(content=COMPLIANCE_SYSTEM_PROMPT),
        HumanMessage(content=json.dumps({
            "action": "compliance_check",
            "source": task.get("source", "unknown"),
            "candidate_source": task.get("candidate_source", task.get("source", "unknown")),
            "proposed_action": task.get("action", "scrape"),
            "estimated_cost": task.get("estimated_cost", 0),
            "source_mode": source_mode,
            "api_available": api_available,
            "cost_notes": task.get("cost_notes", ""),
            "requires_account": task.get("requires_account", False),
            "requires_api_key": task.get("requires_api_key", False),
            "requires_paid_plan": task.get("requires_paid_plan", False),
            "estimated_requests": task.get("estimated_requests", 0),
            "estimated_subscription_cost": task.get("estimated_subscription_cost", task.get("estimated_cost", 0)),
            "pricing_source": task.get("pricing_source", ""),
            "free_alternatives_considered": task.get("free_alternatives_considered", []),
            "budget_remaining": budget_remaining,
            "budget_total": budget_total,
        })),
    ]

    try:
        response = await invoke_together(
            state,
            model=TOGETHER_MODELS["compliance"],
            messages=messages,
            temperature=0.3,
            max_tokens=900,
            log_id=log_id,
        )
        try:
            content = response.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            result = json.loads(content.strip())
            result.setdefault("review_scope", "cost_only" if source_mode == "api_code" else "cost_and_tos")
            result.setdefault("estimated_cost", task.get("estimated_cost", 0))
            result.setdefault("recommended_delay_ms", 0 if source_mode == "api_code" else 1000)
            result.setdefault("warnings", [])
            result.setdefault("data_license", "unknown")
            result.setdefault("budget_fit", True)
            result.setdefault("budget_gap", 0)
            result.setdefault("pricing_source", task.get("pricing_source", "model estimate"))
            result.setdefault("cost_breakdown", [])
            result.setdefault("requires_account", bool(task.get("requires_account", False)))
            result.setdefault("requires_api_key", bool(task.get("requires_api_key", False)))
            result.setdefault("requires_paid_plan", bool(task.get("requires_paid_plan", False)))
            result.setdefault("free_alternatives_considered", task.get("free_alternatives_considered", []))
            result.setdefault("paid_option_justification", "")
            result.setdefault("blocking_reasons", [])
        except (json.JSONDecodeError, IndexError):
            result = {
                "allowed": True,
                "reason": response.content,
                "recommended_delay_ms": 1000,
                "estimated_cost": 0,
                "warnings": [],
                "data_license": "unknown",
                "review_scope": "cost_only" if source_mode == "api_code" else "cost_and_tos",
                "budget_fit": True,
                "budget_gap": 0,
                "pricing_source": task.get("pricing_source", "model estimate"),
                "cost_breakdown": [],
                "requires_account": bool(task.get("requires_account", False)),
                "requires_api_key": bool(task.get("requires_api_key", False)),
                "requires_paid_plan": bool(task.get("requires_paid_plan", False)),
                "free_alternatives_considered": task.get("free_alternatives_considered", []),
                "paid_option_justification": "",
                "blocking_reasons": [],
            }

        if source_mode == "api_code":
            result["review_scope"] = "cost_only"
            over_budget = float(task.get("estimated_cost", 0) or 0) > budget_remaining
            license_text = " ".join([
                str(result.get("data_license", "")),
                " ".join(str(item) for item in result.get("warnings", [])),
                str(result.get("reason", "")),
            ]).lower()
            licensing_risk = any(token in license_text for token in ("restrictive", "prohibited", "license"))
            if over_budget:
                result["allowed"] = False
                result["budget_fit"] = False
                result["budget_gap"] = round(float(task.get("estimated_cost", 0) or 0) - budget_remaining, 2)
                result["blocking_reasons"] = list(result.get("blocking_reasons", [])) + ["budget_exceeded"]
                result["reason"] = (
                    f"Blocked on external data cost: estimated ${float(task.get('estimated_cost', 0) or 0):.2f} "
                    f"exceeds remaining budget ${budget_remaining:.2f}."
                )
            elif result.get("allowed") is False and not licensing_risk:
                warnings = list(result.get("warnings", []))
                warnings.append("API/code sourcing is treated as compliant by definition; only cost/licensing concerns apply.")
                result["warnings"] = warnings
                result["allowed"] = True
                result["reason"] = "API/code sourcing accepted. Costs and licensing were reviewed."
            if result.get("requires_paid_plan") and not result.get("paid_option_justification"):
                result["paid_option_justification"] = "Paid provider should only be used if free alternatives are insufficient."
            result["recommended_delay_ms"] = 0
        elif source_mode == "web_scraping" and api_available:
            warnings = list(result.get("warnings", []))
            warnings.append("A usable API may exist. Prefer API/code sourcing over scraping if feasible.")
            result["warnings"] = warnings

        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="completed",
            summary=f"{'Approved' if result.get('allowed') else 'Blocked'}: {result.get('reason', '')}",
            details={"result": result, "thinking": getattr(response, "reasoning", "")},
            clear_current_task=True,
        )
        return {
            "current_agent": "orchestrator",
            "current_task": None,
            "messages": [AIMessage(content=f"[Compliance Result]: {json.dumps(result)}", name="compliance")],
        }
    except Exception as exc:
        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="failed",
            summary=f"Compliance check failed: {exc}",
            details={"error": str(exc)},
            clear_current_task=True,
        )
        raise
