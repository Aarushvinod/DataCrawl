import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Google Gemini
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

    # Together AI
    TOGETHER_API_KEY: str = os.getenv("TOGETHER_API_KEY", "")

    # Auth0
    AUTH0_DOMAIN: str = os.getenv("AUTH0_DOMAIN", "")
    AUTH0_CLIENT_ID: str = os.getenv("AUTH0_CLIENT_ID", "")
    AUTH0_AUDIENCE: str = os.getenv("AUTH0_AUDIENCE", "")
    AUTH0_ALGORITHMS: list[str] = ["RS256"]

    # Firebase
    FIREBASE_PROJECT_ID: str = os.getenv("FIREBASE_PROJECT_ID", "")
    FIREBASE_CREDENTIALS_PATH: str = os.getenv("FIREBASE_CREDENTIALS_PATH", "")
    FIREBASE_STORAGE_BUCKET: str = os.getenv("FIREBASE_STORAGE_BUCKET", "")
    DATACRAWL_SECRET_KEY: str = os.getenv("DATACRAWL_SECRET_KEY", "")

    # Stripe
    STRIPE_SECRET_KEY: str = os.getenv("STRIPE_SECRET_KEY", "")
    STRIPE_PUBLISHABLE_KEY: str = os.getenv("STRIPE_PUBLISHABLE_KEY", "")
    STRIPE_WEBHOOK_SECRET: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    # Solana
    SOLANA_RPC_URL: str = os.getenv("SOLANA_RPC_URL", "")
    SOLANA_NETWORK: str = os.getenv("SOLANA_NETWORK", "devnet")
    SOLANA_USDC_MINT: str = os.getenv("SOLANA_USDC_MINT", "")
    SOLANA_CONFIRMATION_LEVEL: str = os.getenv("SOLANA_CONFIRMATION_LEVEL", "confirmed")
    SOLANA_PAYMENT_REQUEST_TTL_SECONDS: int = int(os.getenv("SOLANA_PAYMENT_REQUEST_TTL_SECONDS", "900"))

    # Frontend URL (for CORS)
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")


settings = Settings()
