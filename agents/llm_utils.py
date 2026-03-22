from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from langchain_together import ChatTogether
from openai import AsyncOpenAI

from app.config import settings
from app.services.run_control import run_cancellable, update_agent_log


TOGETHER_MODELS = {
    "compliance": "Qwen/Qwen3-235B-A22B-Thinking-2507",
    "script_writer": "Qwen/Qwen3.5-397B-A17B",
    "web_crawler": "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
    "synthetic_generator": "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
    "normalizer": "Qwen/Qwen3-235B-A22B-Thinking-2507",
    "validator": "Qwen/Qwen3-235B-A22B-Thinking-2507",
}


@dataclass
class LLMServiceError(Exception):
    provider: str
    model: str
    reason: str
    detail: str

    def __str__(self) -> str:
        return self.detail


@dataclass
class TogetherResponse:
    content: str
    reasoning: str
    response_metadata: dict[str, Any]


def _classify_error(provider: str, model: str, exc: Exception) -> LLMServiceError:
    detail = str(exc)
    lowered = detail.lower()

    if "401" in lowered or "unauthorized" in lowered or "api key" in lowered:
        reason = "auth_error"
    elif "404" in lowered or "not found" in lowered or "unknown model" in lowered:
        reason = "invalid_model"
    elif "429" in lowered or "rate limit" in lowered:
        reason = "rate_limited"
    elif "timeout" in lowered or "temporarily unavailable" in lowered:
        reason = "timeout"
    else:
        reason = "provider_error"

    return LLMServiceError(provider=provider, model=model, reason=reason, detail=detail)


def require_together_api_key() -> None:
    if not settings.TOGETHER_API_KEY:
        raise LLMServiceError(
            provider="together",
            model="",
            reason="missing_api_key",
            detail="TOGETHER_API_KEY is not configured.",
        )


async def invoke_together(
    state: dict[str, Any],
    *,
    model: str,
    messages: list[Any],
    temperature: float,
    max_tokens: int | None = None,
    extra_body: dict[str, Any] | None = None,
    log_id: str | None = None,
) -> Any:
    require_together_api_key()
    try:
        if model.startswith("Qwen/"):
            client = AsyncOpenAI(
                api_key=settings.TOGETHER_API_KEY,
                base_url="https://api.together.xyz/v1",
            )
            stream = await run_cancellable(
                state["user_id"],
                state["project_id"],
                state["run_id"],
                client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system" if msg.type == "system" else "user", "content": str(msg.content)}
                        for msg in messages
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=True,
                    extra_body=extra_body,
                ),
            )

            reasoning_parts: list[str] = []
            content_parts: list[str] = []
            finish_reason = None
            chunk_count = 0
            async for chunk in stream:
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                delta = choice.delta
                reasoning = getattr(delta, "reasoning", None)
                content = getattr(delta, "content", None)
                if reasoning:
                    reasoning_parts.append(reasoning)
                if content:
                    content_parts.append(content)
                if choice.finish_reason:
                    finish_reason = choice.finish_reason
                chunk_count += 1
                if log_id and chunk_count % 5 == 0:
                    update_agent_log(
                        state["user_id"],
                        state["project_id"],
                        state["run_id"],
                        log_id=log_id,
                        details={
                            "thinking": "".join(reasoning_parts)[-8000:],
                            "content_preview": "".join(content_parts)[-2000:],
                            "model": model,
                            "streaming": True,
                        },
                        summary="Model is thinking..." if reasoning_parts and not content_parts else None,
                    )

            return TogetherResponse(
                content="".join(content_parts),
                reasoning="".join(reasoning_parts),
                response_metadata={
                    "model_name": model,
                    "finish_reason": finish_reason,
                },
            )

        llm = ChatTogether(
            model=model,
            api_key=settings.TOGETHER_API_KEY,
            temperature=temperature,
            max_tokens=max_tokens,
            extra_body=extra_body,
        )
        return await run_cancellable(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            llm.ainvoke(messages),
        )
    except LLMServiceError:
        raise
    except Exception as exc:
        raise _classify_error("together", model, exc) from exc
