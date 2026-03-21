from typing import Annotated, TypedDict, Optional
from langgraph.graph.message import add_messages


class DataCrawlState(TypedDict):
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
    datasets: list[dict]    # Collected dataset references {type, path, lineage}
    agent_logs: list[dict]  # Step-by-step log for UI display
    current_agent: str      # Which agent is currently active
    current_task: Optional[dict]  # Current task being executed by a sub-agent

    # Control
    status: str             # "planning" | "approved" | "running" | "completed" | "failed" | "killed"
    error: Optional[str]
