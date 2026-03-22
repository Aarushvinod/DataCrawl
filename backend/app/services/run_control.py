from __future__ import annotations

import asyncio
import inspect
import uuid
from contextlib import suppress
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from app.services.firebase import get_firestore_client


class RunCancelledError(Exception):
    """Raised when a run has been cancelled by the user."""


_run_cancel_events: dict[str, asyncio.Event] = {}
_run_tasks: dict[str, set[asyncio.Task]] = {}
_run_cleanup: dict[str, list[Callable[[], Any]]] = {}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_run_ref(user_id: str, project_id: str, run_id: str):
    db = get_firestore_client()
    return (
        db.collection("users").document(user_id)
        .collection("projects").document(project_id)
        .collection("runs").document(run_id)
    )


def get_run_doc(user_id: str, project_id: str, run_id: str) -> dict[str, Any]:
    doc = get_run_ref(user_id, project_id, run_id).get()
    return doc.to_dict() if doc.exists else {}


def ensure_cancel_event(run_id: str) -> asyncio.Event:
    event = _run_cancel_events.get(run_id)
    if event is None:
        event = asyncio.Event()
        _run_cancel_events[run_id] = event
    return event


def register_task(run_id: str, task: asyncio.Task) -> None:
    ensure_cancel_event(run_id)
    _run_tasks.setdefault(run_id, set()).add(task)


def unregister_task(run_id: str, task: asyncio.Task) -> None:
    tasks = _run_tasks.get(run_id)
    if not tasks:
        return
    tasks.discard(task)
    if not tasks:
        _run_tasks.pop(run_id, None)


def register_cleanup(run_id: str, cleanup: Callable[[], Any]) -> None:
    _run_cleanup.setdefault(run_id, []).append(cleanup)


async def request_cancel(run_id: str) -> None:
    ensure_cancel_event(run_id).set()

    for task in list(_run_tasks.get(run_id, set())):
        if not task.done():
            task.cancel()

    for cleanup in _run_cleanup.pop(run_id, []):
        try:
            result = cleanup()
            if inspect.isawaitable(result):
                await result
        except Exception:
            continue


def clear_run_control(run_id: str) -> None:
    _run_cancel_events.pop(run_id, None)
    _run_tasks.pop(run_id, None)
    _run_cleanup.pop(run_id, None)


def _progress_from_doc(doc: dict[str, Any]) -> int:
    status = doc.get("status", "planning")
    if status == "completed":
        return 100

    if status == "awaiting_approval":
        return 45

    if status == "awaiting_user_input":
        return max(int(doc.get("progress_percent") or 55), 55)

    if status == "awaiting_paid_approval":
        return max(int(doc.get("progress_percent") or 65), 65)

    if status == "planning":
        return 20 if doc.get("agent_logs") else 10

    total_steps = max(int(doc.get("total_steps") or 0), 0)
    completed_steps = max(int(doc.get("completed_steps") or 0), 0)

    if status in ("approved", "running"):
        if total_steps <= 0:
            return 50
        return min(95, 50 + int((completed_steps / total_steps) * 45))

    return max(int(doc.get("progress_percent") or 0), 0)


def update_run(user_id: str, project_id: str, run_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    run_ref = get_run_ref(user_id, project_id, run_id)
    current = get_run_doc(user_id, project_id, run_id)
    merged = {**current, **updates}
    if "progress_percent" not in updates:
        updates["progress_percent"] = _progress_from_doc(merged)
    run_ref.update(updates)
    return {**merged, **updates}


def append_message(
    user_id: str,
    project_id: str,
    run_id: str,
    role: str,
    content: str,
    *,
    timestamp: str | None = None,
) -> None:
    doc = get_run_doc(user_id, project_id, run_id)
    messages = list(doc.get("messages_display", []))
    messages.append({
        "id": str(uuid.uuid4()),
        "role": role,
        "content": content,
        "timestamp": timestamp or utc_now_iso(),
    })
    update_run(user_id, project_id, run_id, {"messages_display": messages})


def _phase_for_status(status: str) -> str:
    if status in ("planning", "awaiting_approval"):
        return "planning"
    if status in ("awaiting_user_input", "awaiting_paid_approval"):
        return status
    if status in ("approved", "running"):
        return "execution"
    return status


def start_agent_log(
    user_id: str,
    project_id: str,
    run_id: str,
    *,
    agent_name: str,
    action: str,
    summary: str,
    current_task: dict[str, Any] | None = None,
    details: Any = None,
) -> str:
    doc = get_run_doc(user_id, project_id, run_id)
    log_id = str(uuid.uuid4())
    logs = list(doc.get("agent_logs", []))
    logs.append({
        "id": log_id,
        "agent_name": agent_name,
        "action": action,
        "status": "running",
        "summary": summary,
        "details": details,
        "started_at": utc_now_iso(),
    })
    status = doc.get("status", "planning")
    updates: dict[str, Any] = {
        "agent_logs": logs,
        "current_agent": agent_name,
        "current_task": current_task,
        "current_phase": _phase_for_status(status),
    }
    if status == "approved":
        updates["status"] = "running"
    update_run(user_id, project_id, run_id, updates)
    return log_id


def finish_agent_log(
    user_id: str,
    project_id: str,
    run_id: str,
    *,
    log_id: str,
    status: str,
    summary: str | None = None,
    details: Any = None,
    cost: float | None = None,
    clear_current_task: bool = False,
) -> None:
    doc = get_run_doc(user_id, project_id, run_id)
    logs = list(doc.get("agent_logs", []))
    target_agent = ""
    start_time = None
    for entry in logs:
        if entry.get("id") != log_id:
            continue
        target_agent = entry.get("agent_name", "")
        start_time = entry.get("started_at")
        entry["status"] = status
        entry["completed_at"] = utc_now_iso()
        if summary is not None:
            entry["summary"] = summary
        if details is not None:
            entry["details"] = details
        if cost is not None:
            entry["cost"] = cost
        break

    if start_time:
        try:
            started = datetime.fromisoformat(start_time)
            completed = datetime.fromisoformat(entry["completed_at"])
            entry["duration_seconds"] = max(0, int((completed - started).total_seconds()))
        except Exception:
            pass

    updates: dict[str, Any] = {"agent_logs": logs}
    if clear_current_task:
        updates["current_task"] = None
    if target_agent and target_agent == doc.get("current_agent"):
        updates["current_agent"] = "orchestrator" if target_agent != "orchestrator" else ""

    if status == "completed" and doc.get("status") == "running" and target_agent and target_agent != "orchestrator":
        completed_steps = min(
            int(doc.get("completed_steps") or 0) + 1,
            max(int(doc.get("total_steps") or 0), 0),
        )
        updates["completed_steps"] = completed_steps

    if status in ("failed", "killed"):
        updates["status"] = status

    update_run(user_id, project_id, run_id, updates)


def update_agent_log(
    user_id: str,
    project_id: str,
    run_id: str,
    *,
    log_id: str,
    details: Any | None = None,
    summary: str | None = None,
) -> None:
    try:
        doc = get_run_doc(user_id, project_id, run_id)
        logs = list(doc.get("agent_logs", []))
        for entry in logs:
            if entry.get("id") != log_id:
                continue
            if details is not None:
                entry["details"] = details
            if summary is not None:
                entry["summary"] = summary
            break
        update_run(user_id, project_id, run_id, {"agent_logs": logs})
    except Exception:
        return


def is_cancel_requested(user_id: str, project_id: str, run_id: str) -> bool:
    event = _run_cancel_events.get(run_id)
    if event and event.is_set():
        return True
    return get_run_doc(user_id, project_id, run_id).get("status") == "killed"


async def ensure_not_cancelled(user_id: str, project_id: str, run_id: str) -> None:
    if is_cancel_requested(user_id, project_id, run_id):
        raise RunCancelledError(f"Run {run_id} was cancelled")


async def run_cancellable(
    user_id: str,
    project_id: str,
    run_id: str,
    awaitable: Awaitable[Any],
    *,
    poll_interval: float = 0.25,
) -> Any:
    await ensure_not_cancelled(user_id, project_id, run_id)
    task = asyncio.create_task(awaitable)
    register_task(run_id, task)
    try:
        while True:
            done, _ = await asyncio.wait({task}, timeout=poll_interval)
            if task in done:
                return await task
            if is_cancel_requested(user_id, project_id, run_id):
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
                raise RunCancelledError(f"Run {run_id} was cancelled")
    finally:
        unregister_task(run_id, task)
