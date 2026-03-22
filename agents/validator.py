"""Data Validator Agent — Together AI."""

import json
import uuid
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.services.run_control import finish_agent_log, start_agent_log
from agents.llm_utils import TOGETHER_MODELS, describe_exception, invoke_together
from agents.state import DataCrawlState

VALIDATOR_SYSTEM_PROMPT = """You are the DataCrawl Data Validator for financial datasets.

Return a JSON object with keys:
passed, schema_match, missing_columns, unexpected_columns, row_count_actual, row_count_target, row_count_range, row_count_within_tolerance, blocking_failures, repair_instructions, overall_quality_score, recommendations.
"""


def _normalize_row_count_range(task: dict) -> dict:
    range_value = task.get("row_count_range") or {}
    if isinstance(range_value, dict):
        minimum = int(range_value.get("min", task.get("expected_row_count") or task.get("row_count_target") or 0) or 0)
        maximum = int(range_value.get("max", task.get("expected_row_count") or task.get("row_count_target") or 0) or 0)
    else:
        target = int(task.get("expected_row_count") or task.get("row_count_target") or 0)
        minimum = target
        maximum = target
    if minimum and maximum and minimum > maximum:
        minimum, maximum = maximum, minimum
    return {"min": minimum, "max": maximum}


def _expected_columns(task: dict) -> list[str]:
    required = task.get("required_columns")
    if isinstance(required, list) and required:
        return [str(column) for column in required]
    expected_schema = task.get("expected_schema", {})
    if isinstance(expected_schema, dict):
        return [str(column) for column in expected_schema.keys()]
    return []


async def validator_node(state: DataCrawlState) -> dict:
    task = state.get("current_task", {})
    datasets = state.get("datasets", [])
    now = datetime.now(timezone.utc).isoformat()

    input_id = task.get("input_dataset_id", "")
    input_data = next((ds for ds in datasets if ds.get("id") == input_id), None)
    if not input_data and datasets:
        input_data = datasets[-1]

    data_sample = ""
    metadata = {}
    actual_row_count = 0
    actual_columns: list[str] = []
    if input_data:
        if input_data.get("data_csv"):
            data_sample = "\n".join(input_data["data_csv"].split("\n")[:11])
        elif input_data.get("data"):
            data_sample = str(input_data["data"])[:1500]
        actual_row_count = int(input_data.get("row_count", 0) or 0)
        actual_columns = list(input_data.get("columns", []) or [])
        metadata = {
            "row_count": actual_row_count,
            "columns": actual_columns,
            "source_type": input_data.get("type", "unknown"),
            "normalized": input_data.get("normalized", False),
        }

    row_count_range = _normalize_row_count_range(task)
    required_columns = _expected_columns(task)
    strict_schema = bool(task.get("strict_schema", True))
    plan_step_id = str(task.get("plan_step_id") or input_id or "validation")
    missing_columns = [column for column in required_columns if column not in actual_columns]
    unexpected_columns = (
        [column for column in actual_columns if column not in required_columns]
        if strict_schema and required_columns
        else []
    )
    row_count_target = int(task.get("row_count_target") or task.get("expected_row_count") or 0)
    row_count_within_tolerance = (
        row_count_range["min"] <= actual_row_count <= row_count_range["max"]
        if row_count_range["min"] or row_count_range["max"]
        else True
    )
    schema_match = not missing_columns and (not strict_schema or not unexpected_columns)
    blocking_failures: list[str] = []
    if missing_columns:
        blocking_failures.append(f"Missing required columns: {missing_columns}")
    if unexpected_columns:
        blocking_failures.append(f"Unexpected columns present: {unexpected_columns}")
    if not row_count_within_tolerance:
        blocking_failures.append(
            f"Row count {actual_row_count} is outside the expected range {row_count_range['min']}..{row_count_range['max']}."
        )

    log_id = start_agent_log(
        state["user_id"],
        state["project_id"],
        state["run_id"],
        agent_name="validator",
        action="validate",
        summary="Validating the generated dataset",
        current_task=task,
    )

    messages = [
        SystemMessage(content=VALIDATOR_SYSTEM_PROMPT),
        HumanMessage(content=json.dumps({
            "action": "validate",
            "data_sample": data_sample,
            "metadata": metadata,
            "checks": task.get("checks", ["completeness", "schema_match"]),
            "expected_row_count": task.get("expected_row_count"),
            "required_columns": required_columns,
            "row_count_target": row_count_target,
            "row_count_range": row_count_range,
            "strict_schema": strict_schema,
            "deterministic_findings": {
                "schema_match": schema_match,
                "missing_columns": missing_columns,
                "unexpected_columns": unexpected_columns,
                "row_count_actual": actual_row_count,
                "row_count_within_tolerance": row_count_within_tolerance,
                "blocking_failures": blocking_failures,
            },
            "use_case": task.get("use_case", ""),
        })),
    ]

    try:
        response = await invoke_together(
            state,
            model=TOGETHER_MODELS["validator"],
            messages=messages,
            temperature=0.2,
            max_tokens=1800,
            log_id=log_id,
        )
        try:
            content = response.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            result = json.loads(content.strip())
        except (json.JSONDecodeError, IndexError):
            result = {
                "passed": not blocking_failures,
                "schema_match": schema_match,
                "missing_columns": missing_columns,
                "unexpected_columns": unexpected_columns,
                "row_count_actual": actual_row_count,
                "row_count_target": row_count_target,
                "row_count_range": row_count_range,
                "row_count_within_tolerance": row_count_within_tolerance,
                "blocking_failures": blocking_failures,
                "repair_instructions": blocking_failures or ["Validation response could not be parsed"],
                "overall_quality_score": 0.0,
                "recommendations": ["Validation response could not be parsed"],
            }

        result["schema_match"] = schema_match and bool(result.get("schema_match", True))
        result["missing_columns"] = missing_columns or list(result.get("missing_columns", []))
        result["unexpected_columns"] = unexpected_columns or list(result.get("unexpected_columns", []))
        result["row_count_actual"] = actual_row_count
        result["row_count_target"] = row_count_target
        result["row_count_range"] = row_count_range
        result["row_count_within_tolerance"] = row_count_within_tolerance
        result["blocking_failures"] = blocking_failures or list(result.get("blocking_failures", []))
        result["repair_instructions"] = result.get("repair_instructions") or result.get("recommendations") or blocking_failures
        result["passed"] = bool(result.get("passed", True)) and not result["blocking_failures"]

        passed = result.get("passed", True)
        retry_counters = dict(state.get("retry_counters", {}) or {})
        if passed:
            retry_counters[plan_step_id] = 0
        else:
            retry_counters[plan_step_id] = int(retry_counters.get(plan_step_id, 0) or 0) + 1
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

        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="completed",
            summary=f"Validation {'passed' if passed else 'failed'} — score: {result.get('overall_quality_score', 'N/A')}",
            details={
                "result": result,
                "lineage": lineage,
                "thinking": getattr(response, "reasoning", ""),
            },
            clear_current_task=True,
        )
        return {
            "current_agent": "orchestrator",
            "current_task": None,
            "last_validation_result": result,
            "retry_counters": retry_counters,
            "datasets": [{
                "id": input_data.get("id", str(uuid.uuid4())) if input_data else str(uuid.uuid4()),
                "validation_passed": passed,
                "validation_result": result,
                "lineage": lineage,
                "validated_at": now,
            }] if input_data else [],
            "messages": [AIMessage(
                content=f"[Validation {'PASSED' if passed else 'FAILED'}]: Missing columns: {result.get('missing_columns', [])}. Unexpected columns: {result.get('unexpected_columns', [])}. Row count actual/target: {result.get('row_count_actual')} / {result.get('row_count_target')}. Blocking failures: {result.get('blocking_failures', [])}. Repair instructions: {result.get('repair_instructions', [])}",
                name="validator",
            )],
        }
    except Exception as exc:
        error_detail = describe_exception(exc)
        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="failed",
            summary=f"Quality check failed: {error_detail}",
            details={"error": error_detail, "error_type": type(exc).__name__},
            clear_current_task=True,
        )
        raise
