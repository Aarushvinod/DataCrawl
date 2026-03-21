import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from google.cloud.firestore_v1 import SERVER_TIMESTAMP

from app.auth.auth0 import get_user_id
from app.models.schemas import DatasetResponse
from app.services.firebase import get_firestore_client, get_storage_bucket

router = APIRouter()


def _datasets_col(user_id: str, project_id: str):
    db = get_firestore_client()
    return (
        db.collection("users").document(user_id)
        .collection("projects").document(project_id)
        .collection("datasets")
    )


@router.get("/{project_id}/datasets", response_model=list[DatasetResponse])
async def list_datasets(project_id: str, user_id: str = Depends(get_user_id)):
    col = _datasets_col(user_id, project_id)
    docs = col.order_by("created_at", direction="DESCENDING").stream()
    results = []
    for doc in docs:
        d = doc.to_dict()
        results.append(DatasetResponse(
            id=doc.id,
            name=d.get("name", ""),
            format=d.get("format", "csv"),
            size_bytes=d.get("size_bytes", 0),
            row_count=d.get("row_count", 0),
            columns=d.get("columns", []),
            lineage=d.get("lineage", {}),
            source_type=d.get("source_type", "unknown"),
            version=d.get("version", 1),
            created_at=str(d.get("created_at", "")),
        ))
    return results


@router.get("/{project_id}/datasets/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(project_id: str, dataset_id: str, user_id: str = Depends(get_user_id)):
    doc = _datasets_col(user_id, project_id).document(dataset_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Dataset not found")
    d = doc.to_dict()
    return DatasetResponse(
        id=doc.id,
        name=d.get("name", ""),
        format=d.get("format", "csv"),
        size_bytes=d.get("size_bytes", 0),
        row_count=d.get("row_count", 0),
        columns=d.get("columns", []),
        lineage=d.get("lineage", {}),
        source_type=d.get("source_type", "unknown"),
        version=d.get("version", 1),
        created_at=str(d.get("created_at", "")),
    )


@router.get("/{project_id}/datasets/{dataset_id}/download")
async def download_dataset(project_id: str, dataset_id: str, user_id: str = Depends(get_user_id)):
    doc = _datasets_col(user_id, project_id).document(dataset_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Dataset not found")

    d = doc.to_dict()
    storage_path = d.get("storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="Dataset file not found in storage")

    bucket = get_storage_bucket()
    blob = bucket.blob(storage_path)

    if not blob.exists():
        raise HTTPException(status_code=404, detail="Dataset file not found in storage")

    from datetime import timedelta
    url = blob.generate_signed_url(expiration=timedelta(hours=1), method="GET")
    return {"download_url": url}


@router.post("/{project_id}/datasets/upload", response_model=DatasetResponse)
async def upload_dataset(
    project_id: str,
    name: str = Form(...),
    format: str = Form("csv"),
    file: UploadFile = File(...),
    user_id: str = Depends(get_user_id),
):
    """Upload a user dataset for hybrid merging."""
    content = await file.read()
    dataset_id = str(uuid.uuid4())

    # Upload to Firebase Storage
    bucket = get_storage_bucket()
    storage_path = f"datasets/{user_id}/{project_id}/{dataset_id}/data.{format}"
    blob = bucket.blob(storage_path)

    content_type = "text/csv" if format == "csv" else "application/json"
    blob.upload_from_string(content, content_type=content_type)

    # Determine columns and row count from content
    columns = []
    row_count = 0
    try:
        text = content.decode("utf-8")
        lines = text.strip().split("\n")
        if lines:
            columns = [c.strip().strip('"') for c in lines[0].split(",")]
            row_count = len(lines) - 1  # minus header
    except Exception:
        pass

    # Save metadata to Firestore
    col = _datasets_col(user_id, project_id)
    doc_ref = col.document(dataset_id)
    data = {
        "name": name,
        "format": format,
        "storage_path": storage_path,
        "size_bytes": len(content),
        "row_count": row_count,
        "columns": columns,
        "lineage": {
            "source_type": "uploaded",
            "original_filename": file.filename,
            "uploaded_at": str(SERVER_TIMESTAMP),
        },
        "source_type": "uploaded",
        "version": 1,
        "created_at": SERVER_TIMESTAMP,
    }
    doc_ref.set(data)

    return DatasetResponse(
        id=dataset_id,
        name=name,
        format=format,
        size_bytes=len(content),
        row_count=row_count,
        columns=columns,
        lineage=data["lineage"],
        source_type="uploaded",
        version=1,
    )


@router.delete("/{project_id}/datasets/{dataset_id}", status_code=204)
async def delete_dataset(project_id: str, dataset_id: str, user_id: str = Depends(get_user_id)):
    doc_ref = _datasets_col(user_id, project_id).document(dataset_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Delete from storage
    d = doc.to_dict()
    storage_path = d.get("storage_path")
    if storage_path:
        try:
            bucket = get_storage_bucket()
            blob = bucket.blob(storage_path)
            blob.delete()
        except Exception:
            pass  # Storage cleanup is best-effort

    doc_ref.delete()
