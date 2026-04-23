"""Base protocol and shared types for all LLM providers."""

from __future__ import annotations

from enum import StrEnum
from typing import Protocol, runtime_checkable

from pydantic import BaseModel


class TaskType(StrEnum):
    QUALITY_EVAL = "quality_eval"
    CONTENT_SUMMARY = "content_summary"
    PROFILE_MATCH = "profile_match"
    NOVEL_TOPIC = "novel_topic"
    WHY_BLURB = "why_blurb"
    EMBEDDING = "embedding"


class LLMResponse(BaseModel):
    content: str
    input_tokens: int = 0
    output_tokens: int = 0
    model: str = ""
    provider: str = ""


@runtime_checkable
class LLMProvider(Protocol):
    async def complete(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 256,
        temperature: float = 0.3,
    ) -> LLMResponse: ...

    async def embed(self, text: str) -> list[float]: ...

    async def embed_image(self, image_bytes: bytes, mime_type: str) -> list[float]: ...
