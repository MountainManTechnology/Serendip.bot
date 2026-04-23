"""Google Gemini provider — uses google-genai SDK."""

from __future__ import annotations

import asyncio

from agent.config import settings
from agent.providers.base import LLMResponse

_EMBEDDING_MODEL = "text-embedding-004"
_EMBEDDING_DIMENSIONS = 768  # text-embedding-004 — pad to 1536 for DB


class GeminiProvider:
    """Tier-1 provider: fast and cheap for high-volume tasks."""

    def __init__(self, model: str | None = None) -> None:
        from google import genai
        from google.genai import types as genai_types

        self._model_name = model or settings.llm_tier1_model
        self._client = genai.Client(api_key=settings.gemini_api_key)
        self._types = genai_types

    async def complete(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 256,
        temperature: float = 0.3,
    ) -> LLMResponse:
        full_prompt = f"{system}\n\n{prompt}" if system else prompt
        config = self._types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        response = await asyncio.to_thread(
            self._client.models.generate_content,
            model=self._model_name,
            contents=full_prompt,
            config=config,
        )
        text: str = response.text or ""
        usage = response.usage_metadata
        return LLMResponse(
            content=text,
            input_tokens=getattr(usage, "prompt_token_count", 0),
            output_tokens=getattr(usage, "candidates_token_count", 0),
            model=self._model_name,
            provider="gemini",
        )

    async def embed(self, text: str) -> list[float]:
        response = await asyncio.to_thread(
            self._client.models.embed_content,
            model=_EMBEDDING_MODEL,
            contents=text[:8000],
        )
        if response.embeddings and len(response.embeddings) > 0:
            embedding: list[float] = list(response.embeddings[0].values or [])
        else:
            embedding = []
        # Pad to 1536 dimensions to match the DB vector(1536) column
        if len(embedding) < 1536:
            embedding = embedding + [0.0] * (1536 - len(embedding))
        return embedding[:1536]

    async def embed_image(self, image_bytes: bytes, mime_type: str) -> list[float]:
        raise NotImplementedError("GeminiProvider does not support image embeddings")


# Satisfy the Protocol
assert isinstance(GeminiProvider, type)
