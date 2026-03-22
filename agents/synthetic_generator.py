"""Synthetic Data Generator — Llama 4 Maverick via Together AI.

Generates synthetic datasets when real data is unavailable or insufficient.
Produces data in batches with statistical coherence and lineage metadata.
"""

import csv
import io
import json
import uuid
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.services.run_control import finish_agent_log, start_agent_log
from agents.llm_utils import TOGETHER_MODELS, invoke_together
from agents.state import DataCrawlState

SYNTHETIC_SYSTEM_PROMPT = """You are the DataCrawl Synthetic Data Generator. You create realistic synthetic datasets for financial analysis and ML training.

You may only generate synthetic data when the plan explicitly allowed a synthetic fallback. Your output must be clearly marked synthetic in metadata.

## Requirements
- Generate data that is statistically realistic for the given domain.
- Maintain correlations between related fields (e.g., high/low/close prices should be coherent).
- Use realistic value ranges and distributions.
- Include proper timestamps/dates where applicable.

## Output Format
Return ONLY a valid JSON array of objects. Each object is one row.
Example:
```json
[
  {"date": "2024-01-02", "open": 472.65, "high": 475.20, "low": 471.30, "close": 474.50, "volume": 52340100},
  ...
]
```

Do NOT include any explanation, just the JSON array.

## Important
- Generate exactly the number of rows requested.
- Use the exact column names from the schema provided.
- For financial time series, ensure dates are sequential business days.
- Prices should follow realistic random walk patterns.
- Volume should vary realistically.
"""

BATCH_SIZE = 100  # rows per LLM call


async def synthetic_generator_node(state: DataCrawlState) -> dict:
    """Synthetic data generator LangGraph node."""

    task = state.get("current_task", {})
    schema = task.get("schema", {})
    total_rows = task.get("row_count", 100)
    domain_context = task.get("domain_context", "financial data")
    stats = task.get("statistical_properties", {})
    synthetic_allowed = bool(task.get("synthetic_allowed", False))

    now = datetime.now(timezone.utc).isoformat()

    log_id = start_agent_log(
        state["user_id"],
        state["project_id"],
        state["run_id"],
        agent_name="synthetic_generator",
        action="generate_data",
        summary=f"Generating {total_rows} rows of synthetic data",
        current_task=task,
    )

    try:
        if not synthetic_allowed:
            raise RuntimeError("Synthetic generation is not allowed unless the approved plan explicitly enables it.")
        all_rows = []
        batches_needed = (total_rows + BATCH_SIZE - 1) // BATCH_SIZE

        for batch_idx in range(batches_needed):
            rows_in_batch = min(BATCH_SIZE, total_rows - len(all_rows))

            prompt = json.dumps({
                "action": "generate_synthetic_data",
                "schema": schema,
                "row_count": rows_in_batch,
                "domain_context": domain_context,
                "statistical_properties": stats,
                "batch_number": batch_idx + 1,
                "total_batches": batches_needed,
                "previous_last_row": all_rows[-1] if all_rows else None,
            })

            messages = [
                SystemMessage(content=SYNTHETIC_SYSTEM_PROMPT),
                HumanMessage(content=prompt),
            ]

            response = await invoke_together(
                state,
                model=TOGETHER_MODELS["synthetic_generator"],
                messages=messages,
                temperature=0.8,
                max_tokens=2200,
            )

            try:
                content = response.content
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0]
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0]
                batch_rows = json.loads(content.strip())
                if isinstance(batch_rows, list):
                    all_rows.extend(batch_rows)
            except (json.JSONDecodeError, IndexError):
                continue

        csv_output = ""
        if all_rows:
            output = io.StringIO()
            columns = list(all_rows[0].keys()) if all_rows else list(schema.keys()) if isinstance(schema, dict) else []
            writer = csv.DictWriter(output, fieldnames=columns)
            writer.writeheader()
            for row in all_rows:
                writer.writerow(row)
            csv_output = output.getvalue()

        dataset_id = str(uuid.uuid4())

        lineage = {
            "source": "synthetic",
            "model": "llama-4-maverick",
            "generation_params": {
                "schema": schema,
                "row_count": len(all_rows),
                "domain_context": domain_context,
                "statistical_properties": stats,
            },
            "timestamp": now,
        }

        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="completed",
            summary=f"Generated {len(all_rows)} rows of synthetic {domain_context}",
            details={"rows": len(all_rows), "columns": list(all_rows[0].keys()) if all_rows else []},
            clear_current_task=True,
        )
        return {
            "current_agent": "orchestrator",
            "current_task": None,
            "messages": [AIMessage(
                content=f"[Synthetic Data Generated]: {len(all_rows)} rows generated with columns {list(all_rows[0].keys()) if all_rows else []}",
                name="synthetic_generator",
            )],
            "datasets": [{
                "id": dataset_id,
                "type": "synthetic",
                "data_csv": csv_output,
                "row_count": len(all_rows),
                "columns": list(all_rows[0].keys()) if all_rows else [],
                "lineage": lineage,
                "timestamp": now,
            }],
        }
    except Exception as exc:
        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="failed",
            summary=f"Synthetic generation failed: {exc}",
            details={"error": str(exc)},
            clear_current_task=True,
        )
        raise
