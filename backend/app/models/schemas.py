from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime


# ── Projects ──────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    budget: float = Field(0.0, ge=0)


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    budget: Optional[float] = Field(None, ge=0)


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    budget: float
    budget_spent: float
    status: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ── Runs ──────────────────────────────────────────────────

class RunCreate(BaseModel):
    initial_message: str = ""
    generation_mode: Literal["real", "synthetic"] = "real"


class RunMessage(BaseModel):
    message: str = Field(..., min_length=1)


class RunReplanRequest(BaseModel):
    feedback: str = ""
    budget_override: Optional[float] = Field(None, ge=0)


class RunProvideInputRequest(BaseModel):
    request_id: str = Field(..., min_length=1)
    values: dict[str, str] = Field(default_factory=dict)


class RunPaidApprovalRequest(BaseModel):
    request_id: str = Field(..., min_length=1)
    approved: bool
    selected_payment_method_id: Optional[str] = None


class RunCheckoutConfirmationRequest(BaseModel):
    request_id: str = Field(..., min_length=1)
    confirmed: bool


class RunResponse(BaseModel):
    id: str
    status: str
    generation_mode: str = "real"
    plan: Optional[dict] = None
    agent_logs: list[dict] = Field(default_factory=list)
    total_cost: float = 0.0
    budget_total: float = 0.0
    budget_spent: float = 0.0
    current_phase: str = ""
    current_agent: str = ""
    current_task: Optional[dict] = None
    pending_input_request: Optional[dict] = None
    pending_paid_approval: Optional[dict] = None
    budget_analysis: Optional[dict] = None
    plan_version: int = 0
    active_plan_step_id: Optional[str] = None
    retry_counters: dict = Field(default_factory=dict)
    progress_percent: int = 0
    total_steps: int = 0
    completed_steps: int = 0
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    messages: list[dict] = Field(default_factory=list)


# ── Datasets ──────────────────────────────────────────────

class DatasetResponse(BaseModel):
    id: str
    name: str
    format: str
    size_bytes: int = 0
    row_count: int = 0
    columns: list[str] = []
    lineage: dict = Field(default_factory=dict)
    preview_rows: list[dict] = Field(default_factory=list)
    source_type: str
    version: int = 1
    created_at: Optional[str] = None


class DatasetUpload(BaseModel):
    name: str = Field(..., min_length=1)
    format: str = Field(..., pattern=r"^(csv|json|parquet)$")


# ── Billing ───────────────────────────────────────────────

class SetupIntentResponse(BaseModel):
    client_secret: str
    setup_intent_id: str


class PaymentMethodResponse(BaseModel):
    id: str
    type: Literal["stripe_card", "solana_wallet"] = "stripe_card"
    brand: str
    last4: str
    exp_month: Optional[int] = None
    exp_year: Optional[int] = None
    is_default: bool = False
    label: Optional[str] = None
    wallet_address: Optional[str] = None
    network: Optional[str] = None
    asset: Optional[str] = None
    provider: Optional[str] = None


class SolanaWalletChallengeRequest(BaseModel):
    address: str = Field(..., min_length=32)
    label: str = Field(default="", max_length=120)


class SolanaWalletChallengeResponse(BaseModel):
    challenge_id: str
    message: str
    expires_at: str


class SolanaWalletSaveRequest(BaseModel):
    challenge_id: str = Field(..., min_length=1)
    address: str = Field(..., min_length=32)
    signature_base64: str = Field(..., min_length=1)
    label: str = Field(default="", max_length=120)


class RunSolanaPaymentConfirmationRequest(BaseModel):
    request_id: str = Field(..., min_length=1)
    signature: str = Field(..., min_length=1)


class SavedPaymentMethodSummary(BaseModel):
    id: str
    brand: str
    last4: str
    exp_month: int
    exp_year: int


# ── User ──────────────────────────────────────────────────

class UserProfile(BaseModel):
    email: str
    name: str = ""
    auth0_id: str
    stripe_customer_id: Optional[str] = None
    created_at: Optional[str] = None


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
