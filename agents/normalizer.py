"""Data Normalizer Agent — Together AI."""

import json

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.services.run_control import finish_agent_log, start_agent_log
from agents.llm_utils import TOGETHER_MODELS, describe_exception, invoke_together
from agents.state import DataCrawlState

NORMALIZER_SYSTEM_PROMPT = """You are the DataCrawl Data Normalizer.

Your job is schema cleanup only. Do not invent financial values, do not synthesize missing rows, and do not infer semantic data that is not present.

Return a JSON object with keys:
transformations, python_code, warnings.
"""


async def normalizer_node(state: DataCrawlState) -> dict:
    task = state.get("current_task", {})
    datasets = state.get("datasets", [])

    input_id = task.get("input_dataset_id", "")
    input_data = next((ds for ds in datasets if ds.get("id") == input_id), None)
    if not input_data and datasets:
        input_data = datasets[-1]

    data_sample = ""
    if input_data:
        if input_data.get("data_csv"):
            data_sample = "\n".join(input_data["data_csv"].split("\n")[:6])
        elif input_data.get("data"):
            data_sample = str(input_data["data"])[:1000]

    log_id = start_agent_log(
        state["user_id"],
        state["project_id"],
        state["run_id"],
        agent_name="normalizer",
        action="normalize",
        summary="Preparing normalization instructions",
        current_task=task,
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

    try:
        response = await invoke_together(
            state,
            model=TOGETHER_MODELS["normalizer"],
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
                "transformations": [],
                "python_code": "",
                "warnings": ["Could not parse normalizer response"],
            }

        if input_data:
            input_data["normalized"] = True
            input_data["normalization_log"] = result.get("transformations", [])

        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="completed",
            summary=f"Applied {len(result.get('transformations', []))} transformations",
            details={"result": result, "thinking": getattr(response, "reasoning", "")},
            clear_current_task=True,
        )
        return {
            "current_agent": "orchestrator",
            "current_task": None,
            "messages": [AIMessage(
                content=f"[Normalization Complete]: Applied {len(result.get('transformations', []))} transformations. Warnings: {result.get('warnings', ['none'])}",
                name="normalizer",
            )],
            "datasets": [input_data] if input_data else [],
        }
    except Exception as exc:
        error_detail = describe_exception(exc)
        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="failed",
            summary=f"Data cleanup failed: {error_detail}",
            details={"error": error_detail, "error_type": type(exc).__name__},
            clear_current_task=True,
        )
        raise
