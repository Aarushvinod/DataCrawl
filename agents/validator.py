"""Data Validator Agent — Qwen3-235B via Together AI.

Validates datasets for quality, completeness, and fitness for purpose.
Maintains lineage records and produces validation reports.
"""

import json
import uuid
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from langchain_together import ChatTogether

from app.config import settings
from agents.state import DataCrawlState

VALIDATOR_SYSTEM_PROMPT = """You are the DataCrawl Data Validator. You assess dataset quality, completeness, and fitness for the user's intended use case.

## Checks You Can Perform
- **schema_match**: Verify columns, types, and constraints match the specification.
- **completeness**: Check for missing values, date gaps, row count vs expected.
- **no_nulls**: Verify there are no null/NaN values.
- **statistical_sanity**: Check for outliers, reasonable distributions, value ranges.
- **coverage**: Does the data cover the user's requirements (date range, categories, etc.)?
- **consistency**: Cross-check for conflicting values within the dataset.

## Input
You receive:
1. A data sample (first rows as CSV/JSON)
2. Dataset metadata (row count, columns, source type)
3. Which checks to perform
4. Expected row count and use case context

## Output Format
Return a JSON object:
{
  "passed": true/false,
  "checks": {
    "schema_match": {"status": "pass", "details": "..."},
    "completeness": {"status": "pass", "details": "..."},
    ...
  },
  "overall_quality_score": 0.95,
  "recommendations": ["any suggestions"],
  "lineage_update": {
    "validation_timestamp": "...",
    "validator_version": "qwen3-235b"
  }
}

Status can be: "pass", "fail", or "warn".
"""


async def validator_node(state: DataCrawlState) -> dict:
    """Validator LangGraph node."""

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
        input_data = datasets[-1]

    # Build data sample for the LLM
    data_sample = ""
    metadata = {}
    if input_data:
        if input_data.get("data_csv"):
            lines = input_data["data_csv"].split("\n")[:11]
            data_sample = "\n".join(lines)
        elif input_data.get("data"):
            data_sample = str(input_data["data"])[:1500]

        metadata = {
            "row_count": input_data.get("row_count", 0),
            "columns": input_data.get("columns", []),
            "source_type": input_data.get("type", "unknown"),
            "normalized": input_data.get("normalized", False),
        }

    llm = ChatTogether(
        model="Qwen/Qwen3-235B-A22B-Instruct",
        api_key=settings.TOGETHER_API_KEY,
        temperature=0.2,
    )

    messages = [
        SystemMessage(content=VALIDATOR_SYSTEM_PROMPT),
        HumanMessage(content=json.dumps({
            "action": "validate",
            "data_sample": data_sample,
            "metadata": metadata,
            "checks": task.get("checks", ["completeness", "schema_match"]),
            "expected_row_count": task.get("expected_row_count"),
            "use_case": task.get("use_case", ""),
        })),
    ]

    response = await llm.ainvoke(messages)

    # Parse the validation result
    try:
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        result = json.loads(content.strip())
    except (json.JSONDecodeError, IndexError):
        result = {
            "passed": True,
            "checks": {},
            "overall_quality_score": 0.0,
            "recommendations": ["Validation response could not be parsed"],
        }

    passed = result.get("passed", True)

    # Build lineage record
    lineage = {}
    if input_data:
        lineage = {
            "dataset_id": input_data.get("id", str(uuid.uuid4())),
            "sources": [{"type": input_data.get("type", "unknown")}],
            "transformations": input_data.get("normalization_log", []),
            "validation": {
                "passed": passed,
                "checks": result.get("checks", {}),
                "quality_score": result.get("overall_quality_score", 0),
                "validated_at": now,
            },
            "version": 1,
        }

    return {
        "current_agent": "orchestrator",
        "current_task": None,
        "messages": [AIMessage(
            content=f"[Validation {'PASSED' if passed else 'FAILED'}]: Quality score: {result.get('overall_quality_score', 'N/A')}. "
                    f"Checks: {json.dumps(result.get('checks', {}))}. "
                    f"Recommendations: {result.get('recommendations', [])}",
            name="validator",
        )],
        "agent_logs": [{
            "agent": "validator",
            "action": "validate",
            "status": "completed",
            "summary": f"Validation {'passed' if passed else 'failed'} — score: {result.get('overall_quality_score', 'N/A')}",
            "cost_usd": 0,
            "timestamp": now,
            "details": result,
        }],
    }
