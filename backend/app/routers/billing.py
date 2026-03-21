from fastapi import APIRouter, Depends, HTTPException

from app.auth.auth0 import get_user_id
from app.models.schemas import SetupIntentResponse, PaymentMethodResponse
from app.services.firebase import get_firestore_client
from app.services import stripe_service

router = APIRouter()


def _get_stripe_customer_id(user_id: str) -> str:
    """Get the Stripe customer ID for a user."""
    db = get_firestore_client()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="User profile not found. Please call GET /api/user/profile first.")
    d = doc.to_dict()
    cid = d.get("stripe_customer_id")
    if not cid:
        raise HTTPException(status_code=400, detail="No Stripe customer ID found. Please set up your profile first.")
    return cid


@router.post("/setup-intent", response_model=SetupIntentResponse)
async def create_setup_intent(user_id: str = Depends(get_user_id)):
    customer_id = _get_stripe_customer_id(user_id)
    result = await stripe_service.create_setup_intent(customer_id)
    return SetupIntentResponse(**result)


@router.get("/payment-methods", response_model=list[PaymentMethodResponse])
async def list_payment_methods(user_id: str = Depends(get_user_id)):
    customer_id = _get_stripe_customer_id(user_id)
    methods = await stripe_service.list_payment_methods(customer_id)
    return [PaymentMethodResponse(**m) for m in methods]


@router.delete("/payment-methods/{pm_id}", status_code=204)
async def remove_payment_method(pm_id: str, user_id: str = Depends(get_user_id)):
    # Verify user owns this payment method by checking it belongs to their customer
    _get_stripe_customer_id(user_id)
    await stripe_service.detach_payment_method(pm_id)
