"""Web Crawler Agent — Llama 4 Maverick via Together AI + browser-use.

Autonomous browser agent for dynamic websites that require interaction.
Uses browser-use library wrapping Playwright for full browser automation.
"""

import json
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from langchain_together import ChatTogether

from app.config import settings
from agents.state import DataCrawlState


async def web_crawler_node(state: DataCrawlState) -> dict:
    """Web crawler LangGraph node using browser-use."""

    task = state.get("current_task", {})
    now = datetime.now(timezone.utc).isoformat()

    url = task.get("url", "")
    task_description = task.get("task_description", "Extract data from the page")

    try:
        from browser_use import Agent as BrowserAgent

        llm = ChatTogether(
            model="meta-llama/Llama-4-Maverick-17B-128E-Instruct",
            api_key=settings.TOGETHER_API_KEY,
            temperature=0.3,
        )

        agent = BrowserAgent(
            task=f"Navigate to {url} and {task_description}. "
                 f"Extract the data in a structured format (JSON). "
                 f"Return the extracted data as a JSON array.",
            llm=llm,
        )

        result = await agent.run()
        extracted_data = result.final_result() if hasattr(result, 'final_result') else str(result)

        return {
            "current_agent": "orchestrator",
            "current_task": None,
            "messages": [AIMessage(
                content=f"[Web Crawler Result]: Successfully crawled {url}. Extracted data:\n{extracted_data[:2000]}",
                name="web_crawler",
            )],
            "datasets": [{
                "type": "scraped",
                "url": url,
                "data": extracted_data,
                "timestamp": now,
            }],
            "agent_logs": [{
                "agent": "web_crawler",
                "action": "crawl",
                "status": "completed",
                "summary": f"Crawled {url} and extracted data",
                "cost_usd": 0,
                "timestamp": now,
            }],
        }

    except ImportError:
        # browser-use not available — fall back to script-based approach
        llm = ChatTogether(
            model="meta-llama/Llama-4-Maverick-17B-128E-Instruct",
            api_key=settings.TOGETHER_API_KEY,
            temperature=0.3,
        )

        messages = [
            SystemMessage(content="You are a web data extraction agent. Since browser automation is not available, generate a Python requests/BeautifulSoup script to extract the requested data. Return ONLY the script in a ```python``` code block."),
            HumanMessage(content=f"Extract data from {url}. Task: {task_description}"),
        ]

        response = await llm.ainvoke(messages)

        return {
            "current_agent": "orchestrator",
            "current_task": None,
            "messages": [AIMessage(
                content=f"[Web Crawler Fallback]: Browser automation unavailable. Generated extraction script instead.\n{response.content}",
                name="web_crawler",
            )],
            "agent_logs": [{
                "agent": "web_crawler",
                "action": "crawl_fallback",
                "status": "completed",
                "summary": f"Generated fallback script for {url} (browser-use not available)",
                "cost_usd": 0,
                "timestamp": now,
            }],
        }
    except Exception as e:
        return {
            "current_agent": "orchestrator",
            "current_task": None,
            "messages": [AIMessage(
                content=f"[Web Crawler Error]: Failed to crawl {url}: {str(e)}",
                name="web_crawler",
            )],
            "agent_logs": [{
                "agent": "web_crawler",
                "action": "crawl",
                "status": "failed",
                "summary": f"Failed to crawl {url}: {str(e)}",
                "cost_usd": 0,
                "timestamp": now,
            }],
        }
