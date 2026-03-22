from __future__ import annotations

import base64
import hashlib
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet

from app.config import settings
from app.services.firebase import get_firestore_client


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_fernet() -> Fernet:
    secret = settings.DATACRAWL_SECRET_KEY.strip().encode("utf-8")
    if not secret:
        raise RuntimeError("DATACRAWL_SECRET_KEY is not configured.")
    digest = hashlib.sha256(secret).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _secrets_col(user_id: str, project_id: str):
    db = get_firestore_client()
    return (
        db.collection("users").document(user_id)
        .collection("projects").document(project_id)
        .collection("secrets")
    )


def store_secret(
    *,
    user_id: str,
    project_id: str,
    provider: str,
    label: str,
    secret_type: str,
    plaintext: str,
    metadata: dict[str, Any] | None = None,
) -> str:
    if not plaintext:
        raise ValueError("Cannot store an empty secret.")
    fernet = _get_fernet()
    doc_ref = _secrets_col(user_id, project_id).document()
    now = _utc_now()
    doc_ref.set({
        "provider": provider,
        "label": label,
        "secret_type": secret_type,
        "ciphertext": fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8"),
        "metadata": metadata or {},
        "created_at": now,
        "updated_at": now,
        "last_used_at": None,
    })
    return doc_ref.id


def get_secret(
    *,
    user_id: str,
    project_id: str,
    secret_id: str,
) -> dict[str, Any] | None:
    doc = _secrets_col(user_id, project_id).document(secret_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    fernet = _get_fernet()
    plaintext = fernet.decrypt(str(data.get("ciphertext", "")).encode("utf-8")).decode("utf-8")
    doc.reference.update({"last_used_at": _utc_now()})
    return {
        "id": doc.id,
        "provider": data.get("provider", ""),
        "label": data.get("label", ""),
        "secret_type": data.get("secret_type", ""),
        "value": plaintext,
        "metadata": data.get("metadata", {}),
    }


def materialize_secret_env(
    *,
    user_id: str,
    project_id: str,
    env_mapping: dict[str, str] | None,
) -> dict[str, str]:
    resolved: dict[str, str] = {}
    for env_name, secret_id in (env_mapping or {}).items():
        secret = get_secret(user_id=user_id, project_id=project_id, secret_id=secret_id)
        if not secret:
            raise RuntimeError(f"Secret '{secret_id}' was not found.")
        resolved[env_name] = secret["value"]
    return resolved
