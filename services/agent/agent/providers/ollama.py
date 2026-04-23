"""Ollama provider — fully local, no API key required."""

from __future__ import annotations

from agent.config import settings
from agent.providers.base import LLMResponse

_DEFAULT_EMBED_MODEL = "nomic-embed-text"


class OllamaProvider:
    """Fallback provider for self-hosters running Ollama locally."""

    def __init__(self, model: str = "llama3") -> None:
        import ollama as _ollama

        self._model = model
        self._client = _ollama.AsyncClient(host=settings.ollama_base_url)

    async def complete(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 256,
        temperature: float = 0.3,
    ) -> LLMResponse:
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        response = await self._client.chat(
            model=self._model,
            messages=messages,
            options={"num_predict": max_tokens, "temperature": temperature},
        )
        return LLMResponse(
            content=response["message"]["content"],
            model=self._model,
            provider="ollama",
        )

    async def embed(self, text: str) -> list[float]:
        response = await self._client.embeddings(
            model=_DEFAULT_EMBED_MODEL,
            prompt=text[:4000],
        )
        embedding: list[float] = response["embedding"]
        # Pad/truncate to 1536
        if len(embedding) < 1536:
            embedding = embedding + [0.0] * (1536 - len(embedding))
        return embedding[:1536]

    async def embed_image(self, image_bytes: bytes, mime_type: str) -> list[float]:
        raise NotImplementedError("OllamaProvider does not support image embeddings")
