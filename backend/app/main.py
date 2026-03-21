from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
