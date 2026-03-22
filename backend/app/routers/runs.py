import json
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from google.cloud.firestore_v1 import SERVER_TIMESTAMP

from app.auth.auth0 import get_user_id
from app.models.schemas import (
    RunCheckoutConfirmationRequest,
    RunCreate,
    RunMessage,
    RunPaidApprovalRequest,
    RunProvideInputRequest,
    RunReplanRequest,
    RunResponse,
    RunSolanaPaymentConfirmationRequest,
)
from app.services.firebase import get_firestore_client
from app.services.project_secrets import store_secret
from app.services import solana_service, stripe_service
from app.services.run_control import (
    build_planning_reset_state,
    build_planning_reset_updates,
    build_terminal_run_updates,
    clear_run_control,
    request_cancel,
    update_run,
)
from app.tasks.run_agent import run_planning_phase, run_execution_phase

router = APIRouter()

ACTIVE_RUN_STATUSES = {
    "planning",
    "approved",
    "running",
    "awaiting_user_input",
    "awaiting_paid_approval",
}


async def _restart_run_state_if_needed(
    *,
    user_id: str,
    project_id: str,
    run_id: str,
    run_doc: dict,
) -> None:
    if run_doc.get("status") not in ACTIVE_RUN_STATUSES:
        return
    await request_cancel(run_id)
    clear_run_control(run_id)
    update_run(
        user_id,
        project_id,
        run_id,
        build_terminal_run_updates(
            run_doc,
            status="killed",
            current_phase="killed",
            error="Previous attempt stopped so DataCrawl could use your latest instructions.",
        ),
    )


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
        generation_mode=d.get("generation_mode", "real"),
        plan=d.get("plan"),
        agent_logs=d.get("agent_logs", []),
        total_cost=d.get("total_cost", 0),
        budget_total=d.get("budget_total", 0),
        budget_spent=d.get("budget_spent", 0),
        current_phase=d.get("current_phase", ""),
        current_agent=d.get("current_agent", ""),
        current_task=d.get("current_task"),
        pending_input_request=d.get("pending_input_request"),
        pending_paid_approval=d.get("pending_paid_approval"),
        budget_analysis=d.get("budget_analysis"),
        plan_version=d.get("plan_version", 0),
        active_plan_step_id=d.get("active_plan_step_id"),
        retry_counters=d.get("retry_counters", {}),
        progress_percent=d.get("progress_percent", 0),
        total_steps=d.get("total_steps", 0),
        completed_steps=d.get("completed_steps", 0),
        error=d.get("error"),
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
        "generation_mode": body.generation_mode,
        "current_phase": "planning",
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
        "plan": None,
        "agent_logs": [],
        "total_cost": 0.0,
        "started_at": SERVER_TIMESTAMP,
        "completed_at": None,
        "messages_display": [],
        "budget_total": project.get("budget", 0),
        "budget_spent": 0.0,
        "progress_percent": 5,
        "total_steps": 0,
        "completed_steps": 0,
        "saved_dataset_versions": {},
        "error": None,
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
        generation_mode=body.generation_mode,
        current_phase="planning",
        progress_percent=run_data["progress_percent"],
        budget_total=run_data["budget_total"],
        budget_spent=run_data["budget_spent"],
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
    """Send a message to the orchestrator or reopen a finished run with follow-up instructions."""
    doc_ref = _runs_col(user_id, project_id).document(run_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")

    d = doc.to_dict()
    status_value = d.get("status")
    if status_value not in ("planning", "awaiting_approval", "completed", "failed", "killed") and not (
        status_value == "awaiting_user_input" and d.get("current_phase") == "planning"
    ):
        raise HTTPException(status_code=400, detail=f"Run is in '{status_value}' state, cannot send messages")

    await _restart_run_state_if_needed(
        user_id=user_id,
        project_id=project_id,
        run_id=run_id,
        run_doc=d,
    )

    refreshed = doc_ref.get()
    d = refreshed.to_dict() if refreshed.exists else d
    planning_reset = build_planning_reset_updates(
        d,
        budget_total=d.get("budget_total", 0),
        progress_percent=15,
        completed_at=None,
    )

    # Append user message to display
    from google.cloud.firestore_v1 import ArrayUnion
    updates = {
        **planning_reset,
        "messages_display": ArrayUnion([{"role": "user", "content": body.message}]),
    }
    doc_ref.update(updates)

    resume_updates = build_planning_reset_state(
        budget_total=d.get("budget_total", 0),
        generation_mode=d.get("generation_mode", "real"),
    )

    # Continue the planning conversation
    background_tasks.add_task(
        run_planning_phase,
        user_id=user_id,
        project_id=project_id,
        run_id=run_id,
        initial_message=body.message,
        budget=d.get("budget_total", 0),
        is_continuation=True,
        resume_updates=resume_updates,
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
    if d.get("pending_input_request") or d.get("pending_paid_approval"):
        raise HTTPException(status_code=400, detail="Run is waiting for additional input and cannot be approved yet.")
    budget_analysis = d.get("budget_analysis") or {}
    approval_gate = (d.get("plan") or {}).get("approval_gate_summary", {})
    if budget_analysis and budget_analysis.get("within_budget") is False:
        raise HTTPException(status_code=400, detail="Plan is currently over budget. Update the budget and replan before approving.")
    if approval_gate and approval_gate.get("approvable") is False:
        raise HTTPException(status_code=400, detail=approval_gate.get("reason", "Plan is not approvable yet."))

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


@router.post("/{project_id}/runs/{run_id}/replan", response_model=RunResponse)
async def replan_run(
    project_id: str,
    run_id: str,
    body: RunReplanRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_user_id),
):
    doc_ref = _runs_col(user_id, project_id).document(run_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    d = doc.to_dict()
    await _restart_run_state_if_needed(
        user_id=user_id,
        project_id=project_id,
        run_id=run_id,
        run_doc=d,
    )

    refreshed = doc_ref.get()
    d = refreshed.to_dict() if refreshed.exists else d

    budget_total = d.get("budget_total", 0)
    if body.budget_override is not None:
        project_ref = (
            get_firestore_client()
            .collection("users").document(user_id)
            .collection("projects").document(project_id)
        )
        project_ref.update({"budget": body.budget_override, "updated_at": SERVER_TIMESTAMP})
        budget_total = body.budget_override

    feedback = body.feedback.strip() or (
        f"Budget updated to ${budget_total:.2f}. Please rebuild the plan."
        if body.budget_override is not None
        else "Please rebuild the plan with the latest context."
    )

    from google.cloud.firestore_v1 import ArrayUnion

    doc_ref.update({
        **build_planning_reset_updates(
            d,
            budget_total=budget_total,
            progress_percent=15,
            completed_at=None,
        ),
        "budget_total": budget_total,
        "messages_display": ArrayUnion([{"role": "user", "content": feedback}]),
    })

    background_tasks.add_task(
        run_planning_phase,
        user_id=user_id,
        project_id=project_id,
        run_id=run_id,
        initial_message=feedback,
        budget=budget_total,
        is_continuation=True,
        resume_updates=build_planning_reset_state(
            budget_total=budget_total,
            generation_mode=d.get("generation_mode", "real"),
        ),
    )

    return _run_to_response(run_id, doc_ref.get().to_dict())


@router.post("/{project_id}/runs/{run_id}/provide-input", response_model=RunResponse)
async def provide_input(
    project_id: str,
    run_id: str,
    body: RunProvideInputRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_user_id),
):
    doc_ref = _runs_col(user_id, project_id).document(run_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    d = doc.to_dict()
    pending = d.get("pending_input_request") or {}
    if d.get("status") != "awaiting_user_input" or not pending:
        raise HTTPException(status_code=400, detail="Run is not waiting for structured input.")
    if pending.get("request_id") != body.request_id:
        raise HTTPException(status_code=400, detail="Input request id does not match the active request.")

    safe_values: dict[str, str] = {}
    secret_env: dict[str, str] = {}
    for field in pending.get("fields", []):
        field_id = str(field.get("id", ""))
        if not field_id:
            continue
        value = body.values.get(field_id, "")
        if field.get("required") and not value:
            raise HTTPException(status_code=400, detail=f"Missing required input '{field_id}'.")
        if field.get("store_in_vault") and value:
            secret_id = store_secret(
                user_id=user_id,
                project_id=project_id,
                provider=str(field.get("provider") or pending.get("provider") or "user_input"),
                label=str(field.get("label") or field_id),
                secret_type=str(field.get("secret_type") or field.get("input_type") or "secret"),
                plaintext=value,
                metadata={"request_id": body.request_id},
            )
            env_name = str(field.get("env_name") or "").strip()
            if env_name:
                secret_env[env_name] = secret_id
            safe_values[field_id] = "[stored securely]"
        else:
            safe_values[field_id] = value

    resume_message = pending.get("resume_message") or "The user provided the requested information. Continue."
    if secret_env:
        resume_message = (
            f"{resume_message}\nSecret references: {json.dumps({'secret_env': secret_env})}.\n"
            f"Non-secret values: {json.dumps(safe_values)}"
        )
    else:
        resume_message = f"{resume_message}\nProvided values: {json.dumps(safe_values)}"

    doc_ref.update({
        "pending_input_request": None,
        "status": "planning" if pending.get("resume_phase") == "planning" else "running",
        "current_phase": "planning" if pending.get("resume_phase") == "planning" else "execution",
    })

    if pending.get("resume_phase") == "planning":
        background_tasks.add_task(
            run_planning_phase,
            user_id=user_id,
            project_id=project_id,
            run_id=run_id,
            initial_message=resume_message,
            budget=d.get("budget_total", 0),
            is_continuation=True,
        )
    else:
        background_tasks.add_task(
            run_execution_phase,
            user_id=user_id,
            project_id=project_id,
            run_id=run_id,
            resume_message=resume_message,
            resume_updates={"pending_input_request": None},
        )

    return _run_to_response(run_id, doc_ref.get().to_dict())


@router.post("/{project_id}/runs/{run_id}/approve-paid", response_model=RunResponse)
async def approve_paid_step(
    project_id: str,
    run_id: str,
    body: RunPaidApprovalRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_user_id),
):
    doc_ref = _runs_col(user_id, project_id).document(run_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    d = doc.to_dict()
    pending = d.get("pending_paid_approval") or {}
    if d.get("status") != "awaiting_paid_approval" or not pending:
        raise HTTPException(status_code=400, detail="Run is not awaiting paid approval.")
    if pending.get("request_id") != body.request_id:
        raise HTTPException(status_code=400, detail="Paid approval request id does not match the active request.")

    if not body.approved:
        doc_ref.update({
            "pending_paid_approval": None,
            "status": "running",
            "current_phase": "execution",
        })
        background_tasks.add_task(
            run_execution_phase,
            user_id=user_id,
            project_id=project_id,
            run_id=run_id,
            resume_message="The user declined the paid option. Replan using free sources only, or pause if no feasible free path exists.",
            resume_updates={"pending_paid_approval": None},
        )
        return _run_to_response(run_id, doc_ref.get().to_dict())

    supported_methods = {
        str(item).strip().lower()
        for item in (pending.get("supported_payment_methods") or ["stripe"])
        if str(item).strip()
    } or {"stripe"}

    if not body.selected_payment_method_id:
        raise HTTPException(status_code=400, detail="A saved payment method must be selected.")

    if solana_service.is_solana_method_id(body.selected_payment_method_id):
        if "solana" not in supported_methods:
            raise HTTPException(status_code=400, detail="This paid step does not support Solana.")
        try:
            payment_method = await solana_service.get_payment_method(user_id, body.selected_payment_method_id)
            payment_request = solana_service.build_payment_request(pending, payment_method)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        payment_request["selected_payment_method"] = payment_method
        doc_ref.update({
            "pending_paid_approval": None,
            "pending_input_request": payment_request,
            "status": "awaiting_user_input",
            "current_phase": "awaiting_user_input",
        })
        return _run_to_response(run_id, doc_ref.get().to_dict())

    if "stripe" not in supported_methods:
        raise HTTPException(status_code=400, detail="This paid step only supports a Solana payment flow.")

    user_doc = get_firestore_client().collection("users").document(user_id).get()
    stripe_customer_id = (user_doc.to_dict() or {}).get("stripe_customer_id")
    if not stripe_customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer is configured for this user.")

    try:
        payment_method = await stripe_service.validate_payment_method_for_customer(
            stripe_customer_id,
            body.selected_payment_method_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if pending.get("requires_manual_checkout", True):
        confirmation_request = {
            "request_id": pending["request_id"],
            "type": "manual_checkout_confirmation",
            "title": f"Complete checkout for {pending.get('provider', 'provider')}",
            "provider": pending.get("provider"),
            "instructions": pending.get(
                "manual_checkout_instructions",
                "Complete the provider checkout manually in the provider website, then confirm here so DataCrawl can resume account setup.",
            ),
            "selected_payment_method": payment_method,
            "resume_phase": "execution",
            "resume_message": "The user completed manual checkout for the paid provider. Resume account setup and continue execution.",
            "fields": [],
        }
        doc_ref.update({
            "pending_paid_approval": None,
            "pending_input_request": confirmation_request,
            "status": "awaiting_user_input",
            "current_phase": "awaiting_user_input",
        })
        return _run_to_response(run_id, doc_ref.get().to_dict())

    doc_ref.update({
        "pending_paid_approval": None,
        "status": "running",
        "current_phase": "execution",
    })
    background_tasks.add_task(
        run_execution_phase,
        user_id=user_id,
        project_id=project_id,
        run_id=run_id,
        resume_message=(
            f"Paid approval granted for {pending.get('provider', 'provider')} using Stripe payment method "
            f"{payment_method['brand']} ending in {payment_method['last4']}. Continue execution without attempting autonomous checkout."
        ),
        resume_updates={"pending_paid_approval": None},
    )
    return _run_to_response(run_id, doc_ref.get().to_dict())


@router.post("/{project_id}/runs/{run_id}/confirm-checkout", response_model=RunResponse)
async def confirm_checkout(
    project_id: str,
    run_id: str,
    body: RunCheckoutConfirmationRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_user_id),
):
    doc_ref = _runs_col(user_id, project_id).document(run_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    d = doc.to_dict()
    pending = d.get("pending_input_request") or {}
    if pending.get("type") != "manual_checkout_confirmation":
        raise HTTPException(status_code=400, detail="Run is not waiting for manual checkout confirmation.")
    if pending.get("request_id") != body.request_id:
        raise HTTPException(status_code=400, detail="Checkout confirmation request id does not match the active request.")
    if not body.confirmed:
        raise HTTPException(status_code=400, detail="Checkout confirmation must be affirmative to resume execution.")

    doc_ref.update({
        "pending_input_request": None,
        "status": "running",
        "current_phase": "execution",
    })
    background_tasks.add_task(
        run_execution_phase,
        user_id=user_id,
        project_id=project_id,
        run_id=run_id,
        resume_message=pending.get("resume_message") or "The user confirmed checkout completion. Resume execution.",
        resume_updates={"pending_input_request": None},
    )
    return _run_to_response(run_id, doc_ref.get().to_dict())


@router.post("/{project_id}/runs/{run_id}/confirm-solana-payment", response_model=RunResponse)
async def confirm_solana_payment(
    project_id: str,
    run_id: str,
    body: RunSolanaPaymentConfirmationRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_user_id),
):
    doc_ref = _runs_col(user_id, project_id).document(run_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")
    d = doc.to_dict()
    pending = d.get("pending_input_request") or {}
    if pending.get("type") != "solana_payment_confirmation":
        raise HTTPException(status_code=400, detail="Run is not waiting for a Solana payment confirmation.")
    if pending.get("request_id") != body.request_id:
        raise HTTPException(status_code=400, detail="Solana payment request id does not match the active request.")

    try:
        confirmation = await solana_service.verify_payment(
            user_id,
            request_payload=pending,
            signature=body.signature,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    doc_ref.update({
        "pending_input_request": None,
        "status": "running",
        "current_phase": "execution",
    })
    background_tasks.add_task(
        run_execution_phase,
        user_id=user_id,
        project_id=project_id,
        run_id=run_id,
        resume_message=(
            f"The user completed the Solana payment with signature {confirmation['signature']} "
            f"for {pending.get('provider') or 'the paid source'}. Continue execution."
        ),
        resume_updates={"pending_input_request": None},
    )
    return _run_to_response(run_id, doc_ref.get().to_dict())


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

    await request_cancel(run_id)
    clear_run_control(run_id)
    update_run(
        user_id,
        project_id,
        run_id,
        build_terminal_run_updates(
            d,
            status="killed",
            current_phase="killed",
            error="Run cancelled by user",
        ),
    )
    return {"message": "Run killed", "run_id": run_id}


@router.delete("/{project_id}/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_run(project_id: str, run_id: str, user_id: str = Depends(get_user_id)):
    """Delete a finished run while keeping any generated datasets/files."""
    doc_ref = _runs_col(user_id, project_id).document(run_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Run not found")

    d = doc.to_dict()
    if d.get("status") in (
        "planning",
        "approved",
        "running",
        "awaiting_approval",
        "awaiting_user_input",
        "awaiting_paid_approval",
    ):
        raise HTTPException(
            status_code=400,
            detail="Only finished runs can be deleted. Stop the run first if it is still active.",
        )

    doc_ref.delete()
