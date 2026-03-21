from fastapi import APIRouter, Depends, HTTPException, status
from google.cloud.firestore_v1 import SERVER_TIMESTAMP

from app.auth.auth0 import get_user_id
from app.models.schemas import ProjectCreate, ProjectUpdate, ProjectResponse
from app.services.firebase import get_firestore_client

router = APIRouter()


def _projects_col(user_id: str):
    db = get_firestore_client()
    return db.collection("users").document(user_id).collection("projects")


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate, user_id: str = Depends(get_user_id)):
    col = _projects_col(user_id)
    doc_ref = col.document()
    data = {
        "name": body.name,
        "description": body.description,
        "budget": body.budget,
        "budget_spent": 0.0,
        "status": "active",
        "created_at": SERVER_TIMESTAMP,
        "updated_at": SERVER_TIMESTAMP,
    }
    doc_ref.set(data)
    return ProjectResponse(id=doc_ref.id, **{k: v for k, v in data.items() if k not in ("created_at", "updated_at")})


@router.get("", response_model=list[ProjectResponse])
async def list_projects(user_id: str = Depends(get_user_id)):
    col = _projects_col(user_id)
    docs = col.order_by("created_at", direction="DESCENDING").stream()
    projects = []
    for doc in docs:
        d = doc.to_dict()
        projects.append(ProjectResponse(
            id=doc.id,
            name=d.get("name", ""),
            description=d.get("description", ""),
            budget=d.get("budget", 0),
            budget_spent=d.get("budget_spent", 0),
            status=d.get("status", "active"),
            created_at=str(d.get("created_at", "")),
            updated_at=str(d.get("updated_at", "")),
        ))
    return projects


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, user_id: str = Depends(get_user_id)):
    doc = _projects_col(user_id).document(project_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    d = doc.to_dict()
    return ProjectResponse(
        id=doc.id,
        name=d.get("name", ""),
        description=d.get("description", ""),
        budget=d.get("budget", 0),
        budget_spent=d.get("budget_spent", 0),
        status=d.get("status", "active"),
        created_at=str(d.get("created_at", "")),
        updated_at=str(d.get("updated_at", "")),
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, body: ProjectUpdate, user_id: str = Depends(get_user_id)):
    doc_ref = _projects_col(user_id).document(project_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")

    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    updates["updated_at"] = SERVER_TIMESTAMP
    doc_ref.update(updates)

    d = doc_ref.get().to_dict()
    return ProjectResponse(
        id=project_id,
        name=d.get("name", ""),
        description=d.get("description", ""),
        budget=d.get("budget", 0),
        budget_spent=d.get("budget_spent", 0),
        status=d.get("status", "active"),
        created_at=str(d.get("created_at", "")),
        updated_at=str(d.get("updated_at", "")),
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: str, user_id: str = Depends(get_user_id)):
    doc_ref = _projects_col(user_id).document(project_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    doc_ref.delete()
