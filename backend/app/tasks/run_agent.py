"""Background tasks for running the LangGraph agent pipeline.

These run as FastAPI BackgroundTasks — no Celery needed.
State is persisted to Firestore; the frontend sees updates via onSnapshot.
"""

import asyncio
import uuid
import traceback
from datetime import datetime, timezone

from langchain_core.messages import HumanMessage, AIMessage

from app.services.firebase import get_firestore_client, get_storage_bucket
from app.services.run_control import (
    RunCancelledError,
    append_message,
    clear_run_control,
    ensure_cancel_event,
    ensure_not_cancelled,
    get_run_doc,
    get_run_ref,
    register_task,
    unregister_task,
    update_run,
)
from agents.graph import build_graph
from agents.state import DataCrawlState


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
    resume_updates: dict | None = None,
):
    """Run the orchestrator in planning mode.

    The orchestrator converses with the user and generates a plan.
    When it calls `present_plan`, we save the plan and set status to `awaiting_approval`.
    """
    try:
        db = get_firestore_client()
        run_ref = get_run_ref(user_id, project_id, run_id)
        ensure_cancel_event(run_id)
        current_task = asyncio.current_task()
        if current_task is not None:
            register_task(run_id, current_task)

        graph = build_graph(db, user_id, project_id)
        config = {"configurable": {"thread_id": run_id}}
        has_checkpoint = _has_checkpoints(run_ref)

        if is_continuation and has_checkpoint:
            # Resume existing conversation — invoke with the new message
            result = await graph.ainvoke(
                {
                    "messages": [HumanMessage(content=initial_message)],
                    **(resume_updates or {}),
                },
                config=config,
            )
        else:
            # New run — start fresh
            initial_state = {
                "run_id": run_id,
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
                "pending_input_request": None,
                "pending_paid_approval": None,
                "budget_analysis": None,
                "plan_version": 0,
                "active_plan_step_id": None,
                "retry_counters": {},
                "source_research": [],
                "last_script_task": None,
                "last_validation_result": None,
                "completed_steps": 0,
                "total_steps": 0,
                "status": "planning",
                "error": None,
            }
            result = await graph.ainvoke(initial_state, config=config)

        await ensure_not_cancelled(user_id, project_id, run_id)

        latest_ai_message = None
        for msg in result.get("messages", []):
            if isinstance(msg, AIMessage) and msg.content:
                latest_ai_message = msg.content

        updates = {}
        if latest_ai_message:
            doc = get_run_doc(user_id, project_id, run_id)
            displayed = doc.get("messages_display", [])
            if not displayed or displayed[-1].get("content") != latest_ai_message:
                append_message(user_id, project_id, run_id, "assistant", latest_ai_message)

        shared_updates = {
            "current_agent": result.get("current_agent", ""),
            "current_task": result.get("current_task"),
            "pending_input_request": result.get("pending_input_request"),
            "pending_paid_approval": result.get("pending_paid_approval"),
            "budget_analysis": result.get("budget_analysis"),
            "plan_version": result.get("plan_version", 0),
            "active_plan_step_id": result.get("active_plan_step_id"),
            "retry_counters": result.get("retry_counters", {}),
        }

        if result.get("status") == "awaiting_user_input":
            updates.update(shared_updates)
            updates["status"] = "awaiting_user_input"
            updates["current_phase"] = "awaiting_user_input"
            updates["progress_percent"] = 35
        elif result.get("plan") and not result.get("plan_approved"):
            updates["status"] = "awaiting_approval"
            updates["current_phase"] = "awaiting_approval"
            updates["plan"] = result["plan"]
            updates["total_steps"] = len(result["plan"].get("steps", []))
            updates["completed_steps"] = 0
            updates["progress_percent"] = 45
            updates.update(shared_updates)
        elif result.get("plan_approved"):
            updates["status"] = "approved"
            updates["current_phase"] = "execution"
            updates["plan"] = result["plan"]
            updates["progress_percent"] = 50
            updates.update(shared_updates)

        if updates:
            update_run(user_id, project_id, run_id, updates)

    except RunCancelledError:
        update_run(user_id, project_id, run_id, {
            "status": "killed",
            "current_phase": "killed",
            "error": "Run cancelled by user",
        })
        append_message(user_id, project_id, run_id, "assistant", "Run cancelled.")
    except Exception as e:
        traceback.print_exc()
        update_run(user_id, project_id, run_id, {
            "status": "failed",
            "current_phase": "failed",
            "error": str(e),
        })
        append_message(user_id, project_id, run_id, "assistant", f"An error occurred during planning: {str(e)}")
    finally:
        current_task = asyncio.current_task()
        if current_task is not None:
            unregister_task(run_id, current_task)
        if get_run_doc(user_id, project_id, run_id).get("status") in ("completed", "failed", "killed"):
            clear_run_control(run_id)


async def run_execution_phase(
    user_id: str,
    project_id: str,
    run_id: str,
    resume_message: str | None = None,
    resume_updates: dict | None = None,
):
    """Run the full execution phase after plan approval.

    Resumes the LangGraph from the approved state and runs all plan steps.
    Each agent step is logged to Firestore for real-time frontend updates.
    """
    run_ref = get_run_ref(user_id, project_id, run_id)

    try:
        db = get_firestore_client()
        ensure_cancel_event(run_id)
        current_task = asyncio.current_task()
        if current_task is not None:
            register_task(run_id, current_task)
        update_run(user_id, project_id, run_id, {
            "status": "running",
            "current_phase": "execution",
            "progress_percent": 50,
            "error": None,
        })

        graph = build_graph(db, user_id, project_id)
        config = {"configurable": {"thread_id": run_id}}

        await ensure_not_cancelled(user_id, project_id, run_id)

        result = await graph.ainvoke(
            {
                "run_id": run_id,
                "messages": [HumanMessage(content=resume_message or "Plan approved. Execute all steps.")],
                "plan_approved": True,
                "status": "running",
                "current_phase": "execution",
                **(resume_updates or {}),
            },
            config=config,
        )

        await ensure_not_cancelled(user_id, project_id, run_id)

        latest_ai_message = None
        for msg in result.get("messages", []):
            if isinstance(msg, AIMessage) and msg.content:
                latest_ai_message = msg.content
        if latest_ai_message:
            doc = get_run_doc(user_id, project_id, run_id)
            displayed = doc.get("messages_display", [])
            if not displayed or displayed[-1].get("content") != latest_ai_message:
                append_message(user_id, project_id, run_id, "assistant", latest_ai_message)

        if result.get("status") in ("awaiting_user_input", "awaiting_paid_approval"):
            update_run(user_id, project_id, run_id, {
                "status": result.get("status"),
                "current_phase": result.get("current_phase", result.get("status")),
                "current_agent": result.get("current_agent", ""),
                "current_task": result.get("current_task"),
                "pending_input_request": result.get("pending_input_request"),
                "pending_paid_approval": result.get("pending_paid_approval"),
                "budget_analysis": result.get("budget_analysis"),
                "active_plan_step_id": result.get("active_plan_step_id"),
                "retry_counters": result.get("retry_counters", {}),
                "error": None,
            })
            return

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

        update_run(user_id, project_id, run_id, {
            "status": "completed",
            "current_phase": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "current_agent": "",
            "current_task": None,
            "progress_percent": 100,
        })
        append_message(user_id, project_id, run_id, "assistant", f"Execution complete. {len(saved_datasets)} dataset(s) saved.")

    except RunCancelledError:
        update_run(user_id, project_id, run_id, {
            "status": "killed",
            "current_phase": "killed",
            "error": "Run cancelled by user",
        })
        append_message(user_id, project_id, run_id, "assistant", "Run cancelled.")
    except Exception as e:
        traceback.print_exc()
        update_run(user_id, project_id, run_id, {
            "status": "failed",
            "current_phase": "failed",
            "error": str(e),
        })
        append_message(user_id, project_id, run_id, "assistant", f"Execution failed: {str(e)}")
    finally:
        current_task = asyncio.current_task()
        if current_task is not None:
            unregister_task(run_id, current_task)
        if get_run_doc(user_id, project_id, run_id).get("status") in ("completed", "failed", "killed"):
            clear_run_control(run_id)
