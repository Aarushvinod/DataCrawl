"""Compliance Agent — Qwen3-235B via Together AI.

Legal and budget gatekeeper. Called before any scraping or payment action.
Checks robots.txt, TOS, rate limits, and budget constraints.
"""

import json
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from langchain_together import ChatTogether

from app.config import settings
from agents.state import DataCrawlState

COMPLIANCE_SYSTEM_PROMPT = """You are the DataCrawl Compliance Agent. Your job is to check whether a proposed data collection action is legal, ethical, and within budget.

## Your Checks
1. **robots.txt**: Would the target URL likely be blocked by robots.txt? Use your knowledge of common robots.txt rules.
2. **Terms of Service**: Based on your knowledge of the site, are there scraping restrictions?
3. **Rate limiting**: Recommend appropriate request delays.
4. **Budget**: Check if the estimated cost fits within the remaining budget.
5. **Data licensing**: Flag if the data has restrictive licensing.

## Budget Rules
- The budget covers ONLY external data costs (API fees, paid downloads, subscriptions), NOT LLM inference costs.
- If budget is $0, only approve free/public data sources.

## Response Format
Always respond with a JSON object:
{
  "allowed": true/false,
  "reason": "explanation",
  "recommended_delay_ms": 1000,
  "estimated_cost": 0.00,
  "warnings": ["any warnings"],
  "data_license": "public/commercial/restricted/unknown"
}

Be practical. Most public financial data APIs (Yahoo Finance, FRED, SEC EDGAR, Alpha Vantage free tier) are fine to scrape respectfully.
"""


async def compliance_node(state: DataCrawlState) -> dict:
    """Compliance agent LangGraph node."""

    task = state.get("current_task", {})
    budget_total = state.get("budget_total", 0)
    budget_spent = state.get("budget_spent", 0)
    budget_remaining = budget_total - budget_spent

    llm = ChatTogether(
        model="Qwen/Qwen3-235B-A22B-Instruct",
        api_key=settings.TOGETHER_API_KEY,
        temperature=0.3,
    )

    messages = [
        SystemMessage(content=COMPLIANCE_SYSTEM_PROMPT),
        HumanMessage(content=json.dumps({
            "action": "compliance_check",
            "source": task.get("source", "unknown"),
            "proposed_action": task.get("action", "scrape"),
            "estimated_cost": task.get("estimated_cost", 0),
            "budget_remaining": budget_remaining,
            "budget_total": budget_total,
        })),
    ]

    response = await llm.ainvoke(messages)

    now = datetime.now(timezone.utc).isoformat()

    # Try to parse the JSON response
    try:
        content = response.content
        # Extract JSON from response (may be wrapped in markdown)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        result = json.loads(content.strip())
    except (json.JSONDecodeError, IndexError):
        result = {
            "allowed": True,
            "reason": response.content,
            "recommended_delay_ms": 1000,
            "estimated_cost": 0,
            "warnings": [],
            "data_license": "unknown",
        }

    return {
        "current_agent": "orchestrator",
        "current_task": None,
        "messages": [AIMessage(
            content=f"[Compliance Result]: {json.dumps(result)}",
            name="compliance",
        )],
        "agent_logs": [{
            "agent": "compliance",
            "action": "compliance_check",
            "status": "completed",
            "summary": f"{'Approved' if result.get('allowed') else 'Blocked'}: {result.get('reason', '')}",
            "cost_usd": 0,
            "timestamp": now,
        }],
    }
