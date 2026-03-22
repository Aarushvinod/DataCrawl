from __future__ import annotations

import base64
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from urllib.parse import quote

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from app.config import settings
from app.models.schemas import PaymentMethodResponse
from app.services.firebase import get_firestore_client

BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
BASE58_INDEX = {char: index for index, char in enumerate(BASE58_ALPHABET)}
SOLANA_METHOD_PREFIX = "solana:"
SOLANA_USDC_DECIMALS = 6
NETWORK_ENDPOINTS = {
    "devnet": "https://api.devnet.solana.com",
    "mainnet-beta": "https://api.mainnet-beta.solana.com",
}
NETWORK_USDC_MINTS = {
    "devnet": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _normalize_network(value: str | None = None) -> str:
    network = str(value or settings.SOLANA_NETWORK or "devnet").strip().lower()
    if network in NETWORK_ENDPOINTS:
        return network
    return "devnet"


def get_solana_rpc_url(network: str | None = None) -> str:
    normalized = _normalize_network(network)
    if settings.SOLANA_RPC_URL:
        return settings.SOLANA_RPC_URL
    return NETWORK_ENDPOINTS[normalized]


def get_solana_usdc_mint(network: str | None = None) -> str:
    normalized = _normalize_network(network)
    return str(settings.SOLANA_USDC_MINT or NETWORK_USDC_MINTS[normalized]).strip()


def _encode_base58(data: bytes) -> str:
    if not data:
        return ""

    number = int.from_bytes(data, "big")
    encoded = ""
    while number > 0:
        number, remainder = divmod(number, 58)
        encoded = BASE58_ALPHABET[remainder] + encoded

    zero_prefix = 0
    for byte in data:
        if byte != 0:
            break
        zero_prefix += 1

    return ("1" * zero_prefix) + (encoded or "1")


def _decode_base58(value: str) -> bytes:
    if not value:
        raise ValueError("Missing base58 value.")

    number = 0
    for char in value:
        if char not in BASE58_INDEX:
            raise ValueError("Invalid base58 value.")
        number = number * 58 + BASE58_INDEX[char]

    decoded = b"" if number == 0 else number.to_bytes((number.bit_length() + 7) // 8, "big")
    zero_prefix = len(value) - len(value.lstrip("1"))
    return (b"\x00" * zero_prefix) + decoded


def _require_address(value: str, *, label: str = "Solana address") -> str:
    raw = _decode_base58(str(value).strip())
    if len(raw) != 32:
        raise ValueError(f"{label} must be 32 bytes.")
    return str(value).strip()


def _solana_wallets_col(user_id: str):
    db = get_firestore_client()
    return db.collection("users").document(user_id).collection("solana_wallets")


def _solana_challenges_col(user_id: str):
    db = get_firestore_client()
    return db.collection("users").document(user_id).collection("solana_wallet_challenges")


def _solana_confirmations_col(user_id: str):
    db = get_firestore_client()
    return db.collection("users").document(user_id).collection("solana_payment_confirmations")


def build_solana_method_id(address: str) -> str:
    return f"{SOLANA_METHOD_PREFIX}{address}"


def is_solana_method_id(method_id: str | None) -> bool:
    return str(method_id or "").startswith(SOLANA_METHOD_PREFIX)


def parse_solana_method_id(method_id: str) -> str:
    if not is_solana_method_id(method_id):
        raise ValueError("Payment method is not a Solana wallet.")
    return method_id.split(":", 1)[1]


def _to_decimal_amount(value: Any) -> Decimal:
    amount = Decimal(str(value))
    if amount <= 0:
        raise ValueError("Amount must be greater than zero.")
    return amount.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


def _to_base_units(amount: Decimal) -> int:
    return int((amount * Decimal(10 ** SOLANA_USDC_DECIMALS)).to_integral_value(rounding=ROUND_HALF_UP))


def _encode_solana_pay_url(
    *,
    recipient: str,
    amount: Decimal,
    mint: str,
    reference: str,
    label: str,
    message: str,
    memo: str,
) -> str:
    query = [
        f"amount={quote(format(amount, 'f'))}",
        f"spl-token={quote(mint)}",
        f"reference={quote(reference)}",
        f"label={quote(label)}",
        f"message={quote(message)}",
        f"memo={quote(memo)}",
    ]
    return f"solana:{recipient}?{'&'.join(query)}"


def _parse_account_keys(transaction: dict[str, Any]) -> tuple[list[str], list[str]]:
    message = (((transaction or {}).get("transaction") or {}).get("message") or {})
    keys = []
    signers = []
    for entry in message.get("accountKeys", []) or []:
        if isinstance(entry, dict):
            pubkey = str(entry.get("pubkey", "")).strip()
            if pubkey:
                keys.append(pubkey)
                if entry.get("signer"):
                    signers.append(pubkey)
        else:
            pubkey = str(entry).strip()
            if pubkey:
                keys.append(pubkey)
    return keys, signers


def _memo_present(transaction: dict[str, Any], expected_memo: str) -> bool:
    if not expected_memo:
        return True

    instructions = (((transaction or {}).get("transaction") or {}).get("message") or {}).get("instructions", []) or []
    for instruction in instructions:
        if not isinstance(instruction, dict):
            continue
        program = str(instruction.get("program", "")).lower()
        if program not in {"spl-memo", "memo"}:
            continue
        parsed = instruction.get("parsed")
        if isinstance(parsed, str) and parsed == expected_memo:
            return True
        if isinstance(parsed, dict) and str(parsed.get("memo", "")) == expected_memo:
            return True
    return False


def _sum_token_balance(entries: list[dict[str, Any]] | None, owner: str, mint: str) -> int:
    total = 0
    for entry in entries or []:
        if entry.get("owner") != owner or entry.get("mint") != mint:
            continue
        token_amount = (entry.get("uiTokenAmount") or {}).get("amount")
        if token_amount is None:
            continue
        total += int(str(token_amount))
    return total


async def _rpc_request(method: str, params: list[Any], *, network: str | None = None) -> Any:
    rpc_url = get_solana_rpc_url(network)
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": method,
                "params": params,
            },
        )
        response.raise_for_status()
    payload = response.json()
    if payload.get("error"):
        raise ValueError(str(payload["error"]))
    return payload.get("result")


def _challenge_message(*, user_id: str, address: str, challenge_id: str, expires_at: str) -> str:
    return (
        "DataCrawl Solana wallet verification\n\n"
        f"User: {user_id}\n"
        f"Address: {address}\n"
        f"Challenge: {challenge_id}\n"
        f"Expires at: {expires_at}\n"
    )


def _wallet_doc_to_method(address: str, payload: dict[str, Any]) -> dict[str, Any]:
    network = str(payload.get("network") or _normalize_network())
    label = str(payload.get("label") or "Solana wallet").strip() or "Solana wallet"
    return PaymentMethodResponse(
        id=build_solana_method_id(address),
        type="solana_wallet",
        brand="Solana",
        last4=address[-4:],
        is_default=bool(payload.get("is_default", False)),
        label=label,
        wallet_address=address,
        network=network,
        asset=str(payload.get("asset") or "USDC"),
        provider=payload.get("provider"),
    ).model_dump()


async def create_wallet_challenge(user_id: str, address: str, label: str = "") -> dict[str, Any]:
    normalized_address = _require_address(address)
    challenge_id = secrets.token_urlsafe(18)
    expires_at = (_utc_now() + timedelta(minutes=10)).isoformat()
    message = _challenge_message(
        user_id=user_id,
        address=normalized_address,
        challenge_id=challenge_id,
        expires_at=expires_at,
    )
    _solana_challenges_col(user_id).document(challenge_id).set({
        "address": normalized_address,
        "label": label.strip(),
        "message": message,
        "expires_at": expires_at,
        "created_at": _utc_now_iso(),
        "used": False,
    })
    return {
        "challenge_id": challenge_id,
        "message": message,
        "expires_at": expires_at,
    }


async def save_wallet_from_challenge(
    user_id: str,
    *,
    challenge_id: str,
    address: str,
    signature_base64: str,
    label: str = "",
) -> dict[str, Any]:
    normalized_address = _require_address(address)
    challenge_ref = _solana_challenges_col(user_id).document(challenge_id)
    challenge_doc = challenge_ref.get()
    if not challenge_doc.exists:
        raise ValueError("Wallet verification challenge was not found.")

    challenge = challenge_doc.to_dict() or {}
    if challenge.get("used"):
        raise ValueError("Wallet verification challenge has already been used.")
    if challenge.get("address") != normalized_address:
        raise ValueError("Wallet verification challenge does not match this address.")
    if datetime.fromisoformat(str(challenge.get("expires_at"))) < _utc_now():
        raise ValueError("Wallet verification challenge expired. Start again.")

    try:
        signature = base64.b64decode(signature_base64)
        public_key = Ed25519PublicKey.from_public_bytes(_decode_base58(normalized_address))
        public_key.verify(signature, str(challenge.get("message", "")).encode("utf-8"))
    except (ValueError, InvalidSignature, TypeError, Exception) as exc:
        raise ValueError("Wallet signature could not be verified.") from exc

    wallet_payload = {
        "address": normalized_address,
        "network": _normalize_network(),
        "asset": "USDC",
        "label": label.strip() or str(challenge.get("label") or "Solana wallet").strip() or "Solana wallet",
        "verified_at": _utc_now_iso(),
        "created_at": _utc_now_iso(),
        "provider": "solana",
    }
    _solana_wallets_col(user_id).document(normalized_address).set(wallet_payload)
    challenge_ref.update({"used": True, "used_at": _utc_now_iso()})
    return _wallet_doc_to_method(normalized_address, wallet_payload)


async def list_payment_methods(user_id: str) -> list[dict[str, Any]]:
    docs = _solana_wallets_col(user_id).stream()
    methods: list[dict[str, Any]] = []
    for doc in docs:
        methods.append(_wallet_doc_to_method(doc.id, doc.to_dict() or {}))
    methods.sort(key=lambda method: (method.get("label") or method["wallet_address"] or "").lower())
    return methods


async def get_payment_method(user_id: str, method_id: str) -> dict[str, Any]:
    address = parse_solana_method_id(method_id)
    doc = _solana_wallets_col(user_id).document(address).get()
    if not doc.exists:
        raise ValueError("Selected Solana wallet does not belong to this user.")
    return _wallet_doc_to_method(address, doc.to_dict() or {})


async def delete_payment_method(user_id: str, method_id: str) -> bool:
    address = parse_solana_method_id(method_id)
    doc_ref = _solana_wallets_col(user_id).document(address)
    if not doc_ref.get().exists:
        raise ValueError("Saved Solana wallet was not found.")
    doc_ref.delete()
    return True


def build_payment_request(approval: dict[str, Any], payment_method: dict[str, Any]) -> dict[str, Any]:
    if payment_method.get("type") != "solana_wallet":
        raise ValueError("Payment method is not a Solana wallet.")

    raw_request = dict(approval.get("solana_payment_request") or {})
    recipient = _require_address(str(raw_request.get("recipient") or "").strip(), label="Recipient wallet")
    network = _normalize_network(str(raw_request.get("network") or approval.get("network") or settings.SOLANA_NETWORK))
    mint = _require_address(str(raw_request.get("mint") or get_solana_usdc_mint(network)).strip(), label="USDC mint")
    amount = _to_decimal_amount(raw_request.get("amount") or (approval.get("live_price") or {}).get("amount"))
    amount_base_units = _to_base_units(amount)
    reference = _require_address(
        str(raw_request.get("reference") or _encode_base58(secrets.token_bytes(32))).strip(),
        label="Reference key",
    )
    memo = str(raw_request.get("memo") or f"datacrawl:{approval.get('request_id', secrets.token_hex(8))}").strip()
    label = str(raw_request.get("label") or f"DataCrawl • {approval.get('provider') or 'Approved source'}").strip()
    message = str(
        raw_request.get("message")
        or f"Pay {format(amount, 'f')} USDC on Solana to continue with {approval.get('provider') or 'this paid source'}."
    ).strip()
    expires_at = (_utc_now() + timedelta(seconds=max(settings.SOLANA_PAYMENT_REQUEST_TTL_SECONDS, 300))).isoformat()

    return {
        "request_id": str(approval.get("request_id") or secrets.token_urlsafe(12)),
        "type": "solana_payment_confirmation",
        "title": f"Complete the Solana payment for {approval.get('provider') or 'this paid source'}",
        "provider": approval.get("provider"),
        "instructions": (
            "Complete the USDC payment with your saved Solana wallet. "
            "Then confirm the transaction signature here so DataCrawl can resume."
        ),
        "network": network,
        "asset": "USDC",
        "mint": mint,
        "amount": format(amount, "f"),
        "amount_base_units": amount_base_units,
        "recipient": recipient,
        "reference": reference,
        "memo": memo,
        "expected_payer": payment_method.get("wallet_address"),
        "selected_payment_method_id": payment_method.get("id"),
        "payment_url": _encode_solana_pay_url(
            recipient=recipient,
            amount=amount,
            mint=mint,
            reference=reference,
            label=label,
            message=message,
            memo=memo,
        ),
        "expires_at": expires_at,
        "resume_phase": "execution",
        "resume_message": (
            f"The user completed the Solana payment for {approval.get('provider') or 'the paid source'}. "
            "Continue execution."
        ),
        "fields": [],
    }


async def verify_payment(
    user_id: str,
    *,
    request_payload: dict[str, Any],
    signature: str,
) -> dict[str, Any]:
    request_id = str(request_payload.get("request_id") or "").strip()
    if not request_id:
        raise ValueError("Missing Solana payment request id.")
    if datetime.fromisoformat(str(request_payload.get("expires_at"))) < _utc_now():
        raise ValueError("This Solana payment request expired. Start the approval again.")

    confirmation_ref = _solana_confirmations_col(user_id).document(signature)
    if confirmation_ref.get().exists:
        raise ValueError("This Solana transaction was already used for another payment.")

    try:
        transaction = await _rpc_request(
            "getTransaction",
            [
                signature,
                {
                    "encoding": "jsonParsed",
                    "maxSupportedTransactionVersion": 0,
                    "commitment": settings.SOLANA_CONFIRMATION_LEVEL,
                },
            ],
            network=request_payload.get("network"),
        )
    except (ValueError, httpx.HTTPError) as exc:
        raise ValueError("The Solana transaction could not be verified on the configured network.") from exc
    if not transaction:
        raise ValueError("Transaction could not be found on the configured Solana network.")
    if ((transaction.get("meta") or {}).get("err")) is not None:
        raise ValueError("Transaction did not finalize successfully.")

    account_keys, signers = _parse_account_keys(transaction)
    expected_payer = str(request_payload.get("expected_payer") or "").strip()
    expected_reference = str(request_payload.get("reference") or "").strip()
    if expected_payer and expected_payer not in signers:
        raise ValueError("Transaction signer does not match the selected Solana wallet.")
    if expected_reference and expected_reference not in account_keys:
        raise ValueError("Transaction does not contain the expected payment reference.")
    expected_memo = str(request_payload.get("memo") or "").strip()
    if expected_memo and not _memo_present(transaction, expected_memo):
        raise ValueError("Transaction memo does not match the expected payment request.")

    meta = transaction.get("meta") or {}
    pre_total = _sum_token_balance(meta.get("preTokenBalances"), str(request_payload.get("recipient")), str(request_payload.get("mint")))
    post_total = _sum_token_balance(meta.get("postTokenBalances"), str(request_payload.get("recipient")), str(request_payload.get("mint")))
    delta = post_total - pre_total
    expected_amount = int(request_payload.get("amount_base_units") or 0)
    if delta != expected_amount:
        raise ValueError("Transaction amount or recipient does not match the expected USDC payment.")

    confirmation_ref.set({
        "request_id": request_id,
        "signature": signature,
        "network": request_payload.get("network"),
        "recipient": request_payload.get("recipient"),
        "mint": request_payload.get("mint"),
        "amount_base_units": expected_amount,
        "confirmed_at": _utc_now_iso(),
    })
    return {
        "signature": signature,
        "confirmed_at": _utc_now_iso(),
        "network": request_payload.get("network"),
        "amount": request_payload.get("amount"),
        "recipient": request_payload.get("recipient"),
    }
