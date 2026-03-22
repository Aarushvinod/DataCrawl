from typing import Annotated, TypedDict, Optional
from langgraph.graph.message import add_messages


def merge_datasets(existing: list[dict] | None, updates: list[dict] | None) -> list[dict]:
    current = list(existing or [])
    incoming = list(updates or [])
    if not incoming:
        return current

    by_id: dict[str, int] = {}
    for index, dataset in enumerate(current):
        dataset_id = dataset.get("id")
        if dataset_id:
            by_id[str(dataset_id)] = index

    for dataset in incoming:
        dataset_id = dataset.get("id")
        if dataset_id and str(dataset_id) in by_id:
            current[by_id[str(dataset_id)]] = {**current[by_id[str(dataset_id)]], **dataset}
        else:
            current.append(dataset)
            if dataset_id:
                by_id[str(dataset_id)] = len(current) - 1

    return current


class DataCrawlState(TypedDict):
    run_id: str

    # Conversation
    messages: Annotated[list, add_messages]

    # Plan
    plan: Optional[dict]
    plan_approved: bool

    # Project config
    project_id: str
    user_id: str
    budget_total: float     # User-set budget cap (USD) — external costs only
    budget_spent: float     # Running total of external costs spent

    # Agent outputs
    datasets: Annotated[list[dict], merge_datasets]    # Collected dataset references {type, path, lineage}
    agent_logs: list[dict]  # Step-by-step log for UI display
    current_agent: str      # Which agent is currently active
    current_task: Optional[dict]  # Current task being executed by a sub-agent
    pending_input_request: Optional[dict]
    pending_paid_approval: Optional[dict]
    budget_analysis: Optional[dict]
    plan_version: int
    active_plan_step_id: Optional[str]
    retry_counters: dict
    source_research: list[dict]
    last_script_task: Optional[dict]
    last_validation_result: Optional[dict]

    # Control
    status: str             # "planning" | "approved" | "running" | "completed" | "failed" | "killed"
    error: Optional[str]
