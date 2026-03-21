"""Firebase Storage helpers for uploading/downloading datasets."""

import io
import json
from datetime import datetime, timezone

from google.cloud.storage import Bucket


def upload_dataset(
    bucket: Bucket,
    user_id: str,
    project_id: str,
    dataset_id: str,
    data: str,
    file_format: str = "csv",
) -> str:
    """Upload dataset data to Firebase Storage. Returns the storage path."""
    extension = file_format if file_format in ("csv", "json", "parquet") else "csv"
    path = f"datasets/{user_id}/{project_id}/{dataset_id}/data.{extension}"

    blob = bucket.blob(path)

    if file_format == "json":
        blob.upload_from_string(data, content_type="application/json")
    else:
        blob.upload_from_string(data, content_type="text/csv")

    return path


def upload_lineage(
    bucket: Bucket,
    user_id: str,
    project_id: str,
    dataset_id: str,
    lineage: dict,
) -> str:
    """Upload lineage metadata to Firebase Storage."""
    path = f"datasets/{user_id}/{project_id}/{dataset_id}/lineage.json"
    blob = bucket.blob(path)
    blob.upload_from_string(
        json.dumps(lineage, indent=2, default=str),
        content_type="application/json",
    )
    return path


def get_download_url(
    bucket: Bucket,
    storage_path: str,
    expiration_minutes: int = 60,
) -> str:
    """Generate a signed download URL for a file."""
    from datetime import timedelta
    blob = bucket.blob(storage_path)
    url = blob.generate_signed_url(
        expiration=timedelta(minutes=expiration_minutes),
        method="GET",
    )
    return url
