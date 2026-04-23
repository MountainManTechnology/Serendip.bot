"""Anthropic Claude provider."""

from __future__ import annotations

from typing import Any

from agent.config import settings
from agent.providers.base import LLMResponse
from agent.providers.gemini import GeminiProvider


class ClaudeProvider:
    """Tier-2/3 provider: higher quality for complex reasoning tasks."""

    def __init__(self, model: str | None = None) -> None:
        import anthropic

        self._model = model or settings.llm_tier2_model
        self._client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def complete(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 256,
        temperature: float = 0.3,
    ) -> LLMResponse:

        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system

        response = await self._client.messages.create(**kwargs)
        block = response.content[0]
        text = block.text if hasattr(block, "text") else ""
        return LLMResponse(
            content=text,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            model=self._model,
            provider="anthropic",
        )

    async def embed(self, text: str) -> list[float]:
        # Claude has no embedding API — delegate to Gemini
        return await GeminiProvider().embed(text)

    async def embed_image(self, image_bytes: bytes, mime_type: str) -> list[float]:
        raise NotImplementedError("ClaudeProvider does not support image embeddings")
