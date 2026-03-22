from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from langchain_core.messages import HumanMessage
from langchain_together import ChatTogether

from agents.llm_utils import TOGETHER_MODELS
from app.config import settings
from app.services.firebase import init_firebase
from app.routers import projects, runs, datasets, billing, user

app = FastAPI(title="DataCrawl API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_firebase()


app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(runs.router, prefix="/api/projects", tags=["runs"])
app.include_router(datasets.router, prefix="/api/projects", tags=["datasets"])
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])
app.include_router(user.router, prefix="/api/user", tags=["user"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/health/llms")
async def llm_health(probe_remote: bool = True, probe_browser: bool = False):
    report = {
        "status": "ok",
        "gemini": {"configured": bool(settings.GOOGLE_API_KEY)},
        "together": {"configured": bool(settings.TOGETHER_API_KEY)},
        "browser_use": {"configured": True},
    }

    if probe_remote and settings.GOOGLE_API_KEY:
        try:
            client = genai.Client(api_key=settings.GOOGLE_API_KEY)
            async with client.aio as aio_client:
                response = await aio_client.models.generate_content(
                    model="gemini-3.1-pro-preview",
                    contents=[types.Content(role="user", parts=[types.Part.from_text(text="Reply with OK")])],
                    config=types.GenerateContentConfig(temperature=0, max_output_tokens=32),
                )
            report["gemini"]["reachable"] = bool((getattr(response, "text", None) or "").strip())
        except Exception as exc:
            report["status"] = "degraded"
            report["gemini"]["reachable"] = False
            report["gemini"]["error"] = str(exc)

    if probe_remote and settings.TOGETHER_API_KEY:
        try:
            llm = ChatTogether(
                model=TOGETHER_MODELS["compliance"],
                api_key=settings.TOGETHER_API_KEY,
                temperature=0,
                max_tokens=8,
            )
            response = await llm.ainvoke([HumanMessage(content="Reply with OK")])
            report["together"]["reachable"] = bool(getattr(response, "content", "").strip())
            report["together"]["model"] = TOGETHER_MODELS["compliance"]
        except Exception as exc:
            report["status"] = "degraded"
            report["together"]["reachable"] = False
            report["together"]["error"] = str(exc)
            report["together"]["model"] = TOGETHER_MODELS["compliance"]

    if probe_browser:
        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                await browser.close()
            report["browser_use"]["playwright_ready"] = True
        except Exception as exc:
            report["status"] = "degraded"
            report["browser_use"]["playwright_ready"] = False
            report["browser_use"]["error"] = str(exc)

    return report
