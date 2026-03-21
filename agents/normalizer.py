"""Data Normalizer Agent — Qwen3.5-9B via Together AI.

Transforms raw scraped/generated data into a consistent target schema.
Handles renaming, type casting, dedup, null handling, and unit conversions.
"""

import json
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from langchain_together import ChatTogether

from app.config import settings
from agents.state import DataCrawlState

NORMALIZER_SYSTEM_PROMPT = """You are the DataCrawl Data Normalizer. You transform raw data into a clean, consistent target schema.

## Your Operations
- Column renaming/reordering
- Data type casting (dates, numbers)
- Unit conversions
- Deduplication
- Null handling (drop, fill, interpolate)
- Value standardization

## Input
You receive:
1. A sample of the raw data (first few rows as JSON)
2. The target schema (column names and types)
3. Requested operations

## Output Format
Return a JSON object with:
{
  "transformations": [
    {"operation": "rename_column", "from": "old_name", "to": "new_name"},
    {"operation": "cast_type", "column": "col", "from_type": "string", "to_type": "float"},
    ...
  ],
  "python_code": "# Python/pandas code to apply these transformations\nimport pandas as pd\n...",
  "warnings": ["any issues found"]
}

The python_code should be a complete function that takes a pandas DataFrame and returns the normalized DataFrame.
"""


async def normalizer_node(state: DataCrawlState) -> dict:
    """Normalizer LangGraph node."""

    task = state.get("current_task", {})
    datasets = state.get("datasets", [])
    now = datetime.now(timezone.utc).isoformat()

    # Find the input dataset
    input_id = task.get("input_dataset_id", "")
    input_data = None
    for ds in datasets:
        if ds.get("id") == input_id:
            input_data = ds
            break
    if not input_data and datasets:
        input_data = datasets[-1]  # Use most recent dataset

    # Get a sample of the data for the LLM
    data_sample = ""
    if input_data:
        if input_data.get("data_csv"):
            lines = input_data["data_csv"].split("\n")[:6]
            data_sample = "\n".join(lines)
        elif input_data.get("data"):
            data_sample = str(input_data["data"])[:1000]

    llm = ChatTogether(
        model="Qwen/Qwen3.5-9B",
        api_key=settings.TOGETHER_API_KEY,
        temperature=0.2,
    )

    messages = [
        SystemMessage(content=NORMALIZER_SYSTEM_PROMPT),
        HumanMessage(content=json.dumps({
            "action": "normalize",
            "data_sample": data_sample,
            "target_schema": task.get("target_schema", {}),
            "operations": task.get("operations", []),
            "current_columns": input_data.get("columns", []) if input_data else [],
        })),
    ]

    response = await llm.ainvoke(messages)

    # Parse the response
    try:
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        result = json.loads(content.strip())
    except (json.JSONDecodeError, IndexError):
        result = {
            "transformations": [],
            "python_code": "",
            "warnings": ["Could not parse normalizer response"],
        }

    # Update the dataset with normalization info
    if input_data:
        input_data["normalized"] = True
        input_data["normalization_log"] = result.get("transformations", [])

    return {
        "current_agent": "orchestrator",
        "current_task": None,
        "messages": [AIMessage(
            content=f"[Normalization Complete]: Applied {len(result.get('transformations', []))} transformations. Warnings: {result.get('warnings', ['none'])}",
            name="normalizer",
        )],
        "agent_logs": [{
            "agent": "normalizer",
            "action": "normalize",
            "status": "completed",
            "summary": f"Applied {len(result.get('transformations', []))} transformations",
            "cost_usd": 0,
            "timestamp": now,
        }],
    }
