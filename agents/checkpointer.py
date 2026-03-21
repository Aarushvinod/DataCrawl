"""Custom Firestore-based checkpointer for LangGraph.

Stores LangGraph state snapshots in Firestore so agent runs survive
across requests (planning phase) and run in background (execution phase).
"""

from __future__ import annotations

import json
import time
from typing import Any, Optional, Iterator, Sequence

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import (
    BaseCheckpointSaver,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
)
from google.cloud.firestore_v1 import Client as FirestoreClient


def _serialize(obj: Any) -> str:
    """Serialize checkpoint data to JSON string for Firestore storage."""
    return json.dumps(obj, default=str)


def _deserialize(s: str) -> Any:
    """Deserialize JSON string back to checkpoint data."""
    return json.loads(s)


class FirestoreCheckpointer(BaseCheckpointSaver):
    """Persists LangGraph state to Firestore."""

    def __init__(self, db: FirestoreClient, user_id: str, project_id: str):
        super().__init__()
        self.db = db
        self.base_path = f"users/{user_id}/projects/{project_id}"

    def _get_collection(self, thread_id: str):
        return self.db.collection(
            f"{self.base_path}/runs/{thread_id}/checkpoints"
        )

    def put(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: Any = None,
    ) -> RunnableConfig:
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = checkpoint["id"]

        doc_ref = self._get_collection(thread_id).document(checkpoint_id)
        doc_ref.set({
            "checkpoint": _serialize(checkpoint),
            "metadata": _serialize(metadata),
            "checkpoint_ns": checkpoint_ns,
            "thread_id": thread_id,
            "checkpoint_id": checkpoint_id,
            "parent_checkpoint_id": config["configurable"].get("checkpoint_id"),
            "timestamp": time.time(),
        })

        return {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_ns": checkpoint_ns,
                "checkpoint_id": checkpoint_id,
            }
        }

    async def aput(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: Any = None,
    ) -> RunnableConfig:
        return self.put(config, checkpoint, metadata, new_versions)

    def get_tuple(self, config: RunnableConfig) -> Optional[CheckpointTuple]:
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = config["configurable"].get("checkpoint_id")

        collection = self._get_collection(thread_id)

        if checkpoint_id:
            doc = collection.document(checkpoint_id).get()
            if not doc.exists:
                return None
            data = doc.to_dict()
        else:
            # Get the latest checkpoint
            docs = list(
                collection
                .order_by("timestamp", direction="DESCENDING")
                .limit(1)
                .stream()
            )
            if not docs:
                return None
            data = docs[0].to_dict()

        return CheckpointTuple(
            config={
                "configurable": {
                    "thread_id": data["thread_id"],
                    "checkpoint_ns": data.get("checkpoint_ns", ""),
                    "checkpoint_id": data["checkpoint_id"],
                }
            },
            checkpoint=_deserialize(data["checkpoint"]),
            metadata=_deserialize(data["metadata"]),
            parent_config={
                "configurable": {
                    "thread_id": data["thread_id"],
                    "checkpoint_ns": data.get("checkpoint_ns", ""),
                    "checkpoint_id": data.get("parent_checkpoint_id"),
                }
            } if data.get("parent_checkpoint_id") else None,
        )

    async def aget_tuple(self, config: RunnableConfig) -> Optional[CheckpointTuple]:
        return self.get_tuple(config)

    def list(
        self,
        config: Optional[RunnableConfig],
        *,
        filter: Optional[dict[str, Any]] = None,
        before: Optional[RunnableConfig] = None,
        limit: Optional[int] = None,
    ) -> Iterator[CheckpointTuple]:
        if config is None:
            return

        thread_id = config["configurable"]["thread_id"]
        collection = self._get_collection(thread_id)

        query = collection.order_by("timestamp", direction="DESCENDING")
        if limit:
            query = query.limit(limit)

        for doc in query.stream():
            data = doc.to_dict()
            yield CheckpointTuple(
                config={
                    "configurable": {
                        "thread_id": data["thread_id"],
                        "checkpoint_ns": data.get("checkpoint_ns", ""),
                        "checkpoint_id": data["checkpoint_id"],
                    }
                },
                checkpoint=_deserialize(data["checkpoint"]),
                metadata=_deserialize(data["metadata"]),
                parent_config={
                    "configurable": {
                        "thread_id": data["thread_id"],
                        "checkpoint_ns": data.get("checkpoint_ns", ""),
                        "checkpoint_id": data.get("parent_checkpoint_id"),
                    }
                } if data.get("parent_checkpoint_id") else None,
            )

    async def alist(
        self,
        config: Optional[RunnableConfig],
        *,
        filter: Optional[dict[str, Any]] = None,
        before: Optional[RunnableConfig] = None,
        limit: Optional[int] = None,
    ) -> list[CheckpointTuple]:
        return list(self.list(config, filter=filter, before=before, limit=limit))

    def put_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        """Store intermediate writes. For simplicity, we store them with the checkpoint."""
        thread_id = config["configurable"]["thread_id"]
        checkpoint_id = config["configurable"].get("checkpoint_id", "writes")
        doc_ref = self._get_collection(thread_id).document(f"{checkpoint_id}_writes_{task_id}")
        doc_ref.set({
            "writes": _serialize(writes),
            "task_id": task_id,
            "task_path": task_path,
            "timestamp": time.time(),
        })

    async def aput_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        self.put_writes(config, writes, task_id, task_path)
