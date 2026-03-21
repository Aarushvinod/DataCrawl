from fastapi import APIRouter, Depends, HTTPException
from google.cloud.firestore_v1 import SERVER_TIMESTAMP

from app.auth.auth0 import get_current_user, get_user_id
from app.models.schemas import UserProfile, UserProfileUpdate
from app.services.firebase import get_firestore_client
from app.services import stripe_service

router = APIRouter()


@router.get("/profile", response_model=UserProfile)
async def get_profile(user: dict = Depends(get_current_user)):
    user_id = user["sub"]
    db = get_firestore_client()
    doc = db.collection("users").document(user_id).get()

    if doc.exists:
        d = doc.to_dict()
        return UserProfile(
            email=d.get("email", user.get("email", "")),
            name=d.get("name", ""),
            auth0_id=user_id,
            stripe_customer_id=d.get("stripe_customer_id"),
            created_at=str(d.get("created_at", "")),
        )

    # First login — create user profile
    email = user.get("email", user.get(f"https://{user.get('iss', '')}/email", ""))
    # Try to get email from common Auth0 claims
    for claim in ["email", "https://datacrawl.app/email"]:
        if claim in user:
            email = user[claim]
            break

    stripe_id = await stripe_service.get_or_create_customer(email)

    profile_data = {
        "email": email,
        "name": user.get("name", ""),
        "auth0_id": user_id,
        "stripe_customer_id": stripe_id,
        "created_at": SERVER_TIMESTAMP,
    }
    db.collection("users").document(user_id).set(profile_data)

    return UserProfile(
        email=email,
        name=user.get("name", ""),
        auth0_id=user_id,
        stripe_customer_id=stripe_id,
    )


@router.patch("/profile", response_model=UserProfile)
async def update_profile(body: UserProfileUpdate, user: dict = Depends(get_current_user)):
    user_id = user["sub"]
    db = get_firestore_client()
    doc_ref = db.collection("users").document(user_id)

    updates = body.model_dump(exclude_none=True)
    if updates:
        doc_ref.update(updates)

    doc = doc_ref.get()
    d = doc.to_dict()
    return UserProfile(
        email=d.get("email", ""),
        name=d.get("name", ""),
        auth0_id=user_id,
        stripe_customer_id=d.get("stripe_customer_id"),
        created_at=str(d.get("created_at", "")),
    )
