"""Main LangGraph StateGraph definition for DataCrawl.

The orchestrator is the hub — all sub-agents route back to it.
Routing is determined by the `current_agent` field in state.
"""

from langgraph.graph import StateGraph, START, END
from google.cloud.firestore_v1 import Client as FirestoreClient

from agents.state import DataCrawlState
from agents.checkpointer import FirestoreCheckpointer
from agents.orchestrator import orchestrator_node
from agents.script_writer import script_writer_node
from agents.synthetic_generator import synthetic_generator_node
from agents.normalizer import normalizer_node
from agents.validator import validator_node
from agents.compliance import compliance_node
from agents.web_crawler import web_crawler_node


def route_from_orchestrator(state: DataCrawlState) -> str:
    """Determine which node to route to based on orchestrator output."""
    status = state.get("status", "")

    if status in ("completed", "failed", "killed"):
        return END

    current_agent = state.get("current_agent", "")
    if current_agent and current_agent != "orchestrator":
        return current_agent

    # If no routing decision, end (orchestrator responded conversationally)
    return END


def build_graph(
    db: FirestoreClient,
    user_id: str,
    project_id: str,
) -> StateGraph:
    """Build and compile the DataCrawl LangGraph."""

    graph = StateGraph(DataCrawlState)

    # Add all agent nodes
    graph.add_node("orchestrator", orchestrator_node)
    graph.add_node("script_writer", script_writer_node)
    graph.add_node("synthetic_generator", synthetic_generator_node)
    graph.add_node("normalizer", normalizer_node)
    graph.add_node("validator", validator_node)
    graph.add_node("compliance", compliance_node)
    graph.add_node("web_crawler", web_crawler_node)

    # Orchestrator is the entry point
    graph.add_edge(START, "orchestrator")

    # Orchestrator routes to sub-agents or END
    graph.add_conditional_edges("orchestrator", route_from_orchestrator)

    # All sub-agents route back to orchestrator
    for agent_name in [
        "script_writer",
        "synthetic_generator",
        "normalizer",
        "validator",
        "compliance",
        "web_crawler",
    ]:
        graph.add_edge(agent_name, "orchestrator")

    # Compile with Firestore checkpointer
    checkpointer = FirestoreCheckpointer(db, user_id, project_id)
    return graph.compile(checkpointer=checkpointer)
