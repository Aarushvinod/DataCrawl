from pydantic import BaseModel, Field
from typing import Optional
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


class RunMessage(BaseModel):
    message: str = Field(..., min_length=1)


class RunResponse(BaseModel):
    id: str
    status: str
    plan: Optional[dict] = None
    agent_logs: list[dict] = []
    total_cost: float = 0.0
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    messages: list[dict] = []


# ── Datasets ──────────────────────────────────────────────

class DatasetResponse(BaseModel):
    id: str
    name: str
    format: str
    size_bytes: int = 0
    row_count: int = 0
    columns: list[str] = []
    lineage: dict = {}
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
