import stripe
from app.config import settings

stripe.api_key = settings.STRIPE_SECRET_KEY


async def create_setup_intent(customer_id: str) -> dict:
    """Create a Stripe SetupIntent for saving a payment method."""
    intent = stripe.SetupIntent.create(
        customer=customer_id,
        payment_method_types=["card"],
    )
    return {
        "client_secret": intent.client_secret,
        "setup_intent_id": intent.id,
    }


async def get_or_create_customer(email: str, name: str = "") -> str:
    """Get existing Stripe customer or create a new one. Returns customer ID."""
    customers = stripe.Customer.list(email=email, limit=1)
    if customers.data:
        return customers.data[0].id

    customer = stripe.Customer.create(email=email, name=name)
    return customer.id


async def list_payment_methods(customer_id: str) -> list[dict]:
    """List all payment methods for a customer."""
    methods = stripe.PaymentMethod.list(
        customer=customer_id,
        type="card",
    )
    return [
        {
            "id": pm.id,
            "brand": pm.card.brand,
            "last4": pm.card.last4,
            "exp_month": pm.card.exp_month,
            "exp_year": pm.card.exp_year,
            "is_default": False,
        }
        for pm in methods.data
    ]


async def detach_payment_method(payment_method_id: str) -> bool:
    """Detach a payment method from a customer."""
    stripe.PaymentMethod.detach(payment_method_id)
    return True


async def validate_payment_method_for_customer(customer_id: str, payment_method_id: str) -> dict:
    methods = await list_payment_methods(customer_id)
    match = next((method for method in methods if method["id"] == payment_method_id), None)
    if not match:
        raise ValueError("Selected payment method does not belong to this user.")
    return match
