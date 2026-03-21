import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from google.cloud.firestore_v1 import SERVER_TIMESTAMP

from app.auth.auth0 import get_user_id
from app.models.schemas import RunCreate, RunMessage, RunResponse
from app.services.firebase import get_firestore_client
from app.tasks.run_agent import run_planning_phase, run_execution_phase

router = APIRouter()


def _runs_col(user_id: str, project_id: str):
    db = get_firestore_client()
    return (
        db.collection("users").document(user_id)
        .collection("projects").document(project_id)
        .collection("runs")
    )


def _run_to_response(run_id: str, d: dict) -> RunResponse:
    return RunResponse(
        id=run_id,
        status=d.get("status", "unknown"),
        plan=d.get("plan"),
        agent_logs=d.get("agent_logs", []),
        total_cost=d.get("total_cost", 0),
        started_at=str(d.get("started_at", "")),
        completed_at=str(d.get("completed_at", "")),
        messages=d.get("messages_display", []),
    )


@router.post("/{project_id}/runs", response_model=RunResponse, status_code=status.HTTP_201_CREATED)
async def create_run(
    project_id: str,
    body: RunCreate,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_user_id),
):
    """Start a new agent run — enters the planning phase."""
    # Verify project exists
    db = get_firestore_client()
    project_doc = (
        db.collection("users").document(user_id)
        .collection("projects").document(project_id).get()
    )
    if not project_doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")

    project = project_doc.to_dict()

    col = _runs_col(user_id, project_id)
    doc_ref = col.document()
    initial_message = body.initial_message.strip()
    run_data = {
        "status": "planning",
        "plan": None,
        "agent_logs": [],
        "total_cost": 0.0,
        "started_at": SERVER_TIMESTAMP,
        "completed_at": None,
        "messages_display": [],
        "budget_total": project.get("budget", 0),
        "budget_spent": 0.0,
    }
    if initial_message:
        run_data["messages_display"] = [
            {"role": "user", "content": initial_message},
        ]
    doc_ref.set(run_data)

    if initial_message:
        background_tasks.add_task(
            run_planning_phase,
            user_id=user_id,
            project_id=project_id,
            run_id=doc_ref.id,
            initial_message=initial_message,
            budget=project.get("budget", 0),
        )

    return RunResponse(
        id=doc_ref.id,
        status="planning",
        messages=run_data["messages_display"],
    )


@router.get("/{project_id}/runs", response_model=list[RunResponse])
async def list_runs(project_id: str, user_id: str = Depends(get_user_id)):
    col = _runs_col(user_id, project_id)
    docs = col.order_by("started_at", direction="DESCENDING").stream()
    return [_run_to_response(doc.id, doc.to_dict()) for doc in docs]


@router.get("/{project_id}/runs/{run_id}", response_model=RunResponse)
async def get_run(project_id: str, run_id: str, user_id: str = Depends(get_user_id)):
    doc = _runs_col(user_id, project_id).document(run_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_to_response(run_id, doc.to_dict())


@router.post("/{project_id}/runs/{run_id}/message", response_model=RunResponse)
async def send_message(
    project_id: str,
    run_id: str,
    body: RunMessage,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_user_id),
):
    """Send a message to the orchestrator during the planning phase."""
    doc_ref = _runs_col(user_id, project_id).document(run_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")

    d = doc.to_dict()
    if d.get("status") not in ("planning", "awaiting_approval"):
        raise HTTPException(status_code=400, detail=f"Run is in '{d.get('status')}' state, cannot send messages")

    # Append user message to display
    from google.cloud.firestore_v1 import ArrayUnion
    doc_ref.update({
        "messages_display": ArrayUnion([{"role": "user", "content": body.message}]),
    })

    # Continue the planning conversation
    background_tasks.add_task(
        run_planning_phase,
        user_id=user_id,
        project_id=project_id,
        run_id=run_id,
        initial_message=body.message,
        budget=d.get("budget_total", 0),
        is_continuation=True,
    )

    updated = doc_ref.get().to_dict()
    return _run_to_response(run_id, updated)


@router.post("/{project_id}/runs/{run_id}/approve", response_model=RunResponse)
async def approve_plan(
    project_id: str,
    run_id: str,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_user_id),
):
    """Approve the plan and start execution."""
    doc_ref = _runs_col(user_id, project_id).document(run_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")

    d = doc.to_dict()
    if d.get("status") != "awaiting_approval":
        raise HTTPException(status_code=400, detail=f"Run is in '{d.get('status')}' state, not awaiting approval")

    doc_ref.update({"status": "approved"})

    # Launch execution phase
    background_tasks.add_task(
        run_execution_phase,
        user_id=user_id,
        project_id=project_id,
        run_id=run_id,
    )

    updated = doc_ref.get().to_dict()
    return _run_to_response(run_id, updated)


@router.post("/{project_id}/runs/{run_id}/kill", status_code=200)
async def kill_run(project_id: str, run_id: str, user_id: str = Depends(get_user_id)):
    """Kill a running agent run."""
    doc_ref = _runs_col(user_id, project_id).document(run_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")

    d = doc.to_dict()
    if d.get("status") in ("completed", "failed", "killed"):
        raise HTTPException(status_code=400, detail="Run is already finished")

    doc_ref.update({"status": "killed"})
    return {"message": "Run killed", "run_id": run_id}
