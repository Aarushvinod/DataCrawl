"""Web Crawler Agent — Llama 4 Maverick via Together AI + browser-use."""

import json
from datetime import datetime, timezone
import uuid

from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from langchain_together import ChatTogether

from app.config import settings
from app.services.run_control import finish_agent_log, register_cleanup, run_cancellable, start_agent_log
from agents.llm_utils import TOGETHER_MODELS, invoke_together, require_together_api_key
from agents.state import DataCrawlState

WEB_CRAWLER_SYSTEM_PROMPT = """You are the DataCrawl Web Crawler Agent for financial-data collection.

You operate in three modes:
1. recon: inspect provider documentation, pricing, account requirements, and source feasibility.
2. account_setup: create accounts, retrieve API keys, and handle auth prerequisites.
3. extract: collect data via the browser when APIs are unavailable.

Important rules:
- Prefer free providers and free tiers. Paid providers are a last resort.
- If a paid provider is encountered, fetch the exact live price from the provider page or pricing API before proceeding.
- Never submit payment details automatically.
- Never attempt autonomous paid checkout.
- If paid signup is required, return a structured signal that paid approval is needed and include the live price if available.
- If the provider requires email, password, OTP, API keys, or account details from the user, return a structured signal that input is needed.
- If the provider exposes an API key after signup, capture it and return it in structured form so the backend can store it securely.
- Return structured JSON whenever possible.
"""


async def web_crawler_node(state: DataCrawlState) -> dict:
    """Web crawler LangGraph node using browser-use."""

    task = state.get("current_task", {})
    now = datetime.now(timezone.utc).isoformat()

    url = task.get("url", "")
    mode = task.get("mode", "extract")
    provider = task.get("provider", "")
    paid_context = task.get("paid_context", {}) or {}
    task_description = task.get("task_description", "Extract data from the page")
    log_id = start_agent_log(
        state["user_id"],
        state["project_id"],
        state["run_id"],
        agent_name="web_crawler",
        action="crawl",
        summary=f"{mode.replace('_', ' ')} for {provider or url or 'requested source'}",
        current_task=task,
    )

    try:
        from browser_use import Agent as BrowserAgent

        require_together_api_key()
        llm = ChatTogether(
            model=TOGETHER_MODELS["web_crawler"],
            api_key=settings.TOGETHER_API_KEY,
            temperature=0.3,
        )

        crawler_task = (
            f"Mode: {mode}. Provider: {provider or 'unknown'}. "
            f"Navigate to {url} and {task_description}. "
            f"If mode is recon, inspect pricing, docs, auth requirements, and whether free access is sufficient. "
            f"If mode is account_setup, create the account only if allowed, retrieve API keys if available, and identify any user inputs or paid approvals needed. "
            f"If a paid provider is encountered, capture the exact live price, currency, cadence, and what it unlocks, then STOP before checkout. "
            f"If mode is extract, extract the requested financial data in a structured JSON format. "
            f"Return structured JSON only."
        )
        agent = BrowserAgent(
            task=crawler_task,
            llm=llm,
        )

        register_cleanup(
            state["run_id"],
            getattr(agent, "close", lambda: None),
        )

        result = await run_cancellable(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            agent.run(),
        )
        extracted_data = result.final_result() if hasattr(result, 'final_result') else str(result)
        source_research = []
        try:
            parsed = extracted_data if isinstance(extracted_data, dict) else json.loads(str(extracted_data))
            source_research.append({
                "provider": provider or url,
                "mode": mode,
                "result": parsed,
            })
        except Exception:
            if mode == "recon":
                source_research.append({
                    "provider": provider or url,
                    "mode": mode,
                    "result": {"raw": str(extracted_data)[:2000]},
                })

        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="completed",
            summary=f"Crawled {url} and extracted data",
            details={"url": url},
            clear_current_task=True,
        )
        return {
            "current_agent": "orchestrator",
            "current_task": None,
            "source_research": source_research,
            "messages": [AIMessage(
                content=f"[Web Crawler Result]: Mode={mode}. Provider={provider or url}. Output:\n{str(extracted_data)[:2000]}",
                name="web_crawler",
            )],
            "datasets": [{
                "id": str(uuid.uuid4()),
                "type": "scraped",
                "url": url,
                "data": extracted_data,
                "timestamp": now,
            }],
        }

    except ImportError:
        # browser-use not available — fall back to script-based approach
        messages = [
            SystemMessage(content=f"{WEB_CRAWLER_SYSTEM_PROMPT}\nSince browser automation is not available, reason about the provider using text-only extraction support and return structured JSON or a fallback extraction script if needed."),
            HumanMessage(content=json.dumps({
                "mode": mode,
                "provider": provider,
                "url": url,
                "task_description": task_description,
                "paid_context": paid_context,
                "required_user_inputs": task.get("required_user_inputs", []),
            })),
        ]

        response = await invoke_together(
            state,
            model=TOGETHER_MODELS["web_crawler"],
            messages=messages,
            temperature=0.3,
            max_tokens=2200,
        )

        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="completed",
            summary=f"Generated fallback extraction script for {url}",
            details={"fallback": "browser_use_missing"},
            clear_current_task=True,
        )
        return {
            "current_agent": "orchestrator",
            "current_task": None,
            "messages": [AIMessage(
                content=f"[Web Crawler Fallback]: Browser automation unavailable. Result:\n{response.content}",
                name="web_crawler",
            )],
        }
    except Exception as e:
        detail = str(e)
        if "Executable doesn't exist" in detail or "Please run the following command" in detail:
            detail = (
                "Playwright browser binaries are not installed for browser-use. "
                "Run `playwright install chromium` in the backend environment."
            )
        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="failed",
            summary=f"Failed to crawl {url}: {detail}",
            details={"error": detail},
            clear_current_task=True,
        )
        raise RuntimeError(detail) from e
