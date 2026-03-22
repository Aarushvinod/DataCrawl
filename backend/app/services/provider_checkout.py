from __future__ import annotations

import uuid
from decimal import Decimal, InvalidOperation
from typing import Any


def _to_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def normalize_live_price(price_payload: Any) -> dict[str, Any]:
    if isinstance(price_payload, dict):
        amount = _to_decimal(price_payload.get("amount") or price_payload.get("price"))
        currency = str(price_payload.get("currency", "USD")).upper()
        cadence = str(price_payload.get("cadence", "one_time"))
        source = str(price_payload.get("source", "provider page"))
    else:
        amount = _to_decimal(price_payload)
        currency = "USD"
        cadence = "one_time"
        source = "provider page"

    if amount is None:
        raise ValueError("Live provider pricing could not be normalized.")

    return {
        "amount": float(amount),
        "currency": currency,
        "cadence": cadence,
        "source": source,
    }


def price_changed_materially(expected_amount: Any, live_amount: Any, *, tolerance_ratio: float = 0.05) -> bool:
    expected = _to_decimal(expected_amount)
    live = _to_decimal(live_amount)
    if expected is None or live is None:
        return True
    if expected == 0:
        return live != 0
    return abs(live - expected) / expected > Decimal(str(tolerance_ratio))


def build_paid_approval_payload(
    *,
    provider: str,
    live_price: dict[str, Any],
    reason: str,
    free_alternatives: list[str],
    payment_methods: list[dict[str, Any]],
    planned_price: Any = None,
    payment_unlocks: str = "",
    requires_manual_checkout: bool = True,
) -> dict[str, Any]:
    return {
        "request_id": str(uuid.uuid4()),
        "provider": provider,
        "live_price": live_price,
        "planned_price": planned_price,
        "price_changed": price_changed_materially(planned_price, live_price.get("amount")) if planned_price is not None else False,
        "reason": reason,
        "payment_unlocks": payment_unlocks,
        "free_alternatives": free_alternatives,
        "payment_methods": payment_methods,
        "supported_payment_methods": ["stripe"],
        "requires_manual_checkout": requires_manual_checkout,
    }
