from fastapi import APIRouter, Depends, HTTPException

from app.auth.auth0 import get_user_id
from app.models.schemas import (
    PaymentMethodResponse,
    SetupIntentResponse,
    SolanaWalletChallengeRequest,
    SolanaWalletChallengeResponse,
    SolanaWalletSaveRequest,
)
from app.services.firebase import get_firestore_client
from app.services import solana_service, stripe_service

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
    methods: list[dict] = []
    try:
        customer_id = _get_stripe_customer_id(user_id)
        methods.extend(await stripe_service.list_payment_methods(customer_id))
    except HTTPException:
        methods.extend([])
    methods.extend(await solana_service.list_payment_methods(user_id))
    return [PaymentMethodResponse(**m) for m in methods]


@router.post("/solana/challenge", response_model=SolanaWalletChallengeResponse)
async def create_solana_wallet_challenge(
    body: SolanaWalletChallengeRequest,
    user_id: str = Depends(get_user_id),
):
    result = await solana_service.create_wallet_challenge(user_id, body.address, body.label)
    return SolanaWalletChallengeResponse(**result)


@router.post("/solana/wallets", response_model=PaymentMethodResponse)
async def save_solana_wallet(
    body: SolanaWalletSaveRequest,
    user_id: str = Depends(get_user_id),
):
    try:
        method = await solana_service.save_wallet_from_challenge(
            user_id,
            challenge_id=body.challenge_id,
            address=body.address,
            signature_base64=body.signature_base64,
            label=body.label,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PaymentMethodResponse(**method)


@router.delete("/payment-methods/{pm_id}", status_code=204)
async def remove_payment_method(pm_id: str, user_id: str = Depends(get_user_id)):
    if solana_service.is_solana_method_id(pm_id):
        try:
            await solana_service.delete_payment_method(user_id, pm_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return

    # Verify user owns this payment method by checking it belongs to their customer
    _get_stripe_customer_id(user_id)
    normalized_id = pm_id.split(":", 1)[1] if pm_id.startswith("stripe:") else pm_id
    await stripe_service.detach_payment_method(normalized_id)
