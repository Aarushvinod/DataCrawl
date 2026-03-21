"""Background tasks for running the LangGraph agent pipeline.

These run as FastAPI BackgroundTasks — no Celery needed.
State is persisted to Firestore; the frontend sees updates via onSnapshot.
"""

import asyncio
import json
import uuid
import traceback
from datetime import datetime, timezone

from langchain_core.messages import HumanMessage, AIMessage
from google.cloud.firestore_v1 import ArrayUnion

from app.services.firebase import get_firestore_client, get_storage_bucket
from agents.graph import build_graph
from agents.state import DataCrawlState


def _get_run_ref(user_id: str, project_id: str, run_id: str):
    db = get_firestore_client()
    return (
        db.collection("users").document(user_id)
        .collection("projects").document(project_id)
        .collection("runs").document(run_id)
    )


def _update_run(run_ref, updates: dict):
    """Update the Firestore run document."""
    try:
        run_ref.update(updates)
    except Exception as e:
        print(f"Failed to update run: {e}")


def _is_killed(run_ref) -> bool:
    """Check if the run has been killed by the user."""
    try:
        doc = run_ref.get()
        return doc.to_dict().get("status") == "killed"
    except Exception:
        return False


def _has_checkpoints(run_ref) -> bool:
    """Check whether LangGraph has already persisted state for this run."""
    try:
        docs = list(run_ref.collection("checkpoints").limit(1).stream())
        return len(docs) > 0
    except Exception:
        return False


async def run_planning_phase(
    user_id: str,
    project_id: str,
    run_id: str,
    initial_message: str,
    budget: float,
    is_continuation: bool = False,
):
    """Run the orchestrator in planning mode.

    The orchestrator converses with the user and generates a plan.
    When it calls `present_plan`, we save the plan and set status to `awaiting_approval`.
    """
    try:
        db = get_firestore_client()
        run_ref = _get_run_ref(user_id, project_id, run_id)

        graph = build_graph(db, user_id, project_id)
        config = {"configurable": {"thread_id": run_id}}
        has_checkpoint = _has_checkpoints(run_ref)

        if is_continuation and has_checkpoint:
            # Resume existing conversation — invoke with the new message
            result = await graph.ainvoke(
                {"messages": [HumanMessage(content=initial_message)]},
                config=config,
            )
        else:
            # New run — start fresh
            initial_state = {
                "messages": [HumanMessage(content=initial_message)],
                "plan": None,
                "plan_approved": False,
                "project_id": project_id,
                "user_id": user_id,
                "budget_total": budget,
                "budget_spent": 0.0,
                "datasets": [],
                "agent_logs": [],
                "current_agent": "",
                "current_task": None,
                "status": "planning",
                "error": None,
            }
            result = await graph.ainvoke(initial_state, config=config)

        # Extract the latest AI message for display
        ai_messages = []
        for msg in result.get("messages", []):
            if isinstance(msg, AIMessage) and msg.content:
                ai_messages.append({"role": "assistant", "content": msg.content})

        # Update Firestore with the result
        updates = {}
        if ai_messages:
            updates["messages_display"] = ArrayUnion(ai_messages)

        if result.get("agent_logs"):
            updates["agent_logs"] = ArrayUnion(result["agent_logs"])

        # Check if a plan was presented
        if result.get("plan") and not result.get("plan_approved"):
            updates["status"] = "awaiting_approval"
            updates["plan"] = result["plan"]
        elif result.get("plan_approved"):
            updates["status"] = "approved"
            updates["plan"] = result["plan"]

        if updates:
            _update_run(run_ref, updates)

    except Exception as e:
        traceback.print_exc()
        run_ref = _get_run_ref(user_id, project_id, run_id)
        _update_run(run_ref, {
            "status": "failed",
            "agent_logs": ArrayUnion([{
                "agent": "system",
                "action": "error",
                "status": "failed",
                "summary": f"Planning failed: {str(e)}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }]),
            "messages_display": ArrayUnion([
                {"role": "assistant", "content": f"An error occurred during planning: {str(e)}"}
            ]),
        })


async def run_execution_phase(
    user_id: str,
    project_id: str,
    run_id: str,
):
    """Run the full execution phase after plan approval.

    Resumes the LangGraph from the approved state and runs all plan steps.
    Each agent step is logged to Firestore for real-time frontend updates.
    """
    run_ref = _get_run_ref(user_id, project_id, run_id)

    try:
        db = get_firestore_client()
        _update_run(run_ref, {"status": "running"})

        graph = build_graph(db, user_id, project_id)
        config = {"configurable": {"thread_id": run_id}}

        # Resume the graph with plan approval
        result = await graph.ainvoke(
            {
                "messages": [HumanMessage(content="Plan approved. Execute all steps.")],
                "plan_approved": True,
                "status": "running",
            },
            config=config,
        )

        # Check kill switch
        if _is_killed(run_ref):
            return

        # Process results — save datasets to Firebase Storage
        datasets = result.get("datasets", [])
        bucket = get_storage_bucket()
        saved_datasets = []

        for ds in datasets:
            if ds.get("data_csv") or ds.get("data"):
                dataset_id = ds.get("id", str(uuid.uuid4()))
                data_content = ds.get("data_csv") or str(ds.get("data", ""))
                file_format = "csv" if ds.get("data_csv") else "json"

                # Upload to Storage
                storage_path = f"datasets/{user_id}/{project_id}/{dataset_id}/data.{file_format}"
                blob = bucket.blob(storage_path)
                blob.upload_from_string(data_content, content_type="text/csv" if file_format == "csv" else "application/json")

                # Save metadata to Firestore
                dataset_doc = {
                    "name": ds.get("target_data", ds.get("type", "dataset")),
                    "format": file_format,
                    "storage_path": storage_path,
                    "size_bytes": len(data_content.encode("utf-8")),
                    "row_count": ds.get("row_count", data_content.count("\n")),
                    "columns": ds.get("columns", []),
                    "lineage": ds.get("lineage", {"source_type": ds.get("type", "unknown")}),
                    "source_type": ds.get("type", "unknown"),
                    "version": 1,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }

                datasets_col = (
                    db.collection("users").document(user_id)
                    .collection("projects").document(project_id)
                    .collection("datasets")
                )
                datasets_col.document(dataset_id).set(dataset_doc)
                saved_datasets.append(dataset_id)

        # Mark run as completed
        _update_run(run_ref, {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "agent_logs": ArrayUnion(result.get("agent_logs", [])),
            "messages_display": ArrayUnion([
                {"role": "assistant", "content": f"Execution complete. {len(saved_datasets)} dataset(s) saved."}
            ]),
        })

    except Exception as e:
        traceback.print_exc()
        _update_run(run_ref, {
            "status": "failed",
            "agent_logs": ArrayUnion([{
                "agent": "system",
                "action": "error",
                "status": "failed",
                "summary": f"Execution failed: {str(e)}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }]),
            "messages_display": ArrayUnion([
                {"role": "assistant", "content": f"Execution failed: {str(e)}"}
            ]),
        })
