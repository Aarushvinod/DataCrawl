"""Script Writer Agent — Qwen3.5-397B via Together AI.

Generates Python scraping scripts for APIs and websites.
Scripts output structured data (CSV/JSON) and handle pagination,
rate limiting, and error handling.
"""

import json
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from langchain_together import ChatTogether

from app.config import settings
from agents.state import DataCrawlState

SCRIPT_WRITER_SYSTEM_PROMPT = """You are the DataCrawl Script Writer Agent. You generate Python scripts that collect data from APIs and websites.

## Requirements
- Scripts must be self-contained Python files that can run independently.
- Use only standard libraries + requests + beautifulsoup4 + pandas.
- Output data as CSV to stdout or to a specified output path.
- Include proper error handling, retries, and rate limiting.
- Handle pagination if the data source requires it.
- Add a brief docstring explaining what the script does.
- The script should accept command-line arguments for customization (e.g., ticker, date range).

## Output Format
Return ONLY the Python script code, wrapped in ```python ... ```.
No additional explanation outside the code block.

## Common Financial Data Sources (prefer these)
- Yahoo Finance: yfinance library or direct API
- Alpha Vantage: REST API with free tier
- FRED (Federal Reserve): fredapi or direct REST
- SEC EDGAR: REST API, no auth needed
- IEX Cloud: REST API
- Polygon.io: REST API

## Important
- Always respect rate limits.
- Include a User-Agent header in requests.
- The script will be executed in a sandboxed environment.
"""


async def script_writer_node(state: DataCrawlState) -> dict:
    """Script writer LangGraph node."""

    task = state.get("current_task", {})

    llm = ChatTogether(
        model="Qwen/Qwen3.5-397B-A17B",
        api_key=settings.TOGETHER_API_KEY,
        temperature=0.3,
    )

    messages = [
        SystemMessage(content=SCRIPT_WRITER_SYSTEM_PROMPT),
        HumanMessage(content=json.dumps({
            "action": "generate_script",
            "source": task.get("source", ""),
            "target_data": task.get("target_data", ""),
            "output_schema": task.get("output_schema", {}),
            "params": task.get("params", {}),
        })),
    ]

    response = await llm.ainvoke(messages)

    now = datetime.now(timezone.utc).isoformat()

    # Extract the script from the response
    content = response.content
    script = content
    if "```python" in content:
        script = content.split("```python")[1].split("```")[0].strip()
    elif "```" in content:
        script = content.split("```")[1].split("```")[0].strip()

    return {
        "current_agent": "orchestrator",
        "current_task": None,
        "messages": [AIMessage(
            content=f"[Script Generated]:\n```python\n{script}\n```",
            name="script_writer",
        )],
        "datasets": [{
            "type": "script",
            "script": script,
            "source": task.get("source", ""),
            "target_data": task.get("target_data", ""),
            "timestamp": now,
        }],
        "agent_logs": [{
            "agent": "script_writer",
            "action": "generate_script",
            "status": "completed",
            "summary": f"Generated scraping script for {task.get('source', 'unknown source')}",
            "cost_usd": 0,
            "timestamp": now,
        }],
    }
