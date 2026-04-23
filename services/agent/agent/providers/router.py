"""LLM routing layer.

Provider priority (first configured wins for each tier):
  1. Azure AI Foundry  (AZURE_AI_FOUNDRY_ENDPOINT + AZURE_AI_FOUNDRY_API_KEY)
  2. Google Gemini     (GEMINI_API_KEY)          -- tier 1 default
  3. Anthropic Claude  (ANTHROPIC_API_KEY)        -- tier 2/3 default
  4. Ollama            (OLLAMA_BASE_URL)           -- local fallback
"""

from __future__ import annotations

from agent.config import settings
from agent.logging import log
from agent.providers.base import LLMProvider, LLMResponse, TaskType

# Task -> tier mapping
_TIER1_TASKS = {TaskType.QUALITY_EVAL, TaskType.CONTENT_SUMMARY, TaskType.WHY_BLURB}
_TIER2_TASKS = {TaskType.PROFILE_MATCH}
_TIER3_TASKS = {TaskType.NOVEL_TOPIC}


def _azure_configured() -> bool:
    return bool(settings.azure_ai_foundry_endpoint and settings.azure_ai_foundry_api_key)


def _provider_name_from_key(key: str) -> str:
    """Map the internal provider cache key to a display name."""
    if key == "azure":
        return "azure"
    # key is 'tier1', 'tier2', 'tier3' — map via settings
    if settings.azure_ai_foundry_endpoint:
        return "azure"
    if key == "tier1":
        return "gemini" if settings.gemini_api_key else "claude"
    if key in ("tier2", "tier3"):
        return "claude" if settings.anthropic_api_key else "ollama"
    return "ollama"


async def _push_cost_event(
    response: LLMResponse,
    task_type: str,
    call_type: str,
    trace_id: str | None = None,
    user_id: str | None = None,
) -> None:
    """Fire-and-forget LLM cost event. Never raises."""
    try:
        import redis.asyncio as _aioredis

        from agent.providers.pricing import estimate_cost
        from agent.telemetry import get_worker_id, now_iso, push_event

        cost = estimate_cost(
            model=response.model,
            prompt_tokens=response.input_tokens,
            completion_tokens=response.output_tokens if call_type == "chat" else None,
        )
        r = _aioredis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]
        try:
            await push_event(
                r,
                {
                    "type": "llm_cost",
                    "ts": now_iso(),
                    "trace_id": trace_id,
                    "worker_id": get_worker_id(),
                    "user_id": user_id,
                    "task_type": task_type,
                    "call_type": call_type,
                    "model": response.model,
                    "provider": response.provider,
                    "prompt_tokens": response.input_tokens,
                    "completion_tokens": response.output_tokens if call_type == "chat" else None,
                    "estimated_cost_usd": cost,
                },
            )
        finally:
            await r.close()
    except Exception:  # noqa: BLE001
        pass


class LLMRouter:
    def __init__(self) -> None:
        self._providers: dict[str, LLMProvider] = {}

    def _build_provider(self, tier: int) -> LLMProvider:
        # Azure AI Foundry takes priority across all tiers when configured.
        # It supports every task type with a single deployment.
        if _azure_configured():
            from agent.providers.azure_ai import AzureAIFoundryProvider

            return AzureAIFoundryProvider(settings.azure_ai_foundry_deployment or None)

        if tier == 1:
            if settings.gemini_api_key:
                from agent.providers.gemini import GeminiProvider

                return GeminiProvider(settings.llm_tier1_model)
            # Fall through to Claude if Gemini not configured
            if settings.anthropic_api_key:
                from agent.providers.claude import ClaudeProvider

                return ClaudeProvider(settings.llm_tier2_model)

        if tier in (2, 3):
            if settings.anthropic_api_key:
                from agent.providers.claude import ClaudeProvider

                model = settings.llm_tier2_model if tier == 2 else settings.llm_tier3_model
                return ClaudeProvider(model)

        # Final fallback: Ollama (local, no API key required)
        from agent.providers.ollama import OllamaProvider

        return OllamaProvider()

    def _get_provider(self, tier: int) -> LLMProvider:
        # When Azure is configured all tiers share the same deployment
        key = "azure" if _azure_configured() else f"tier{tier}"
        if key not in self._providers:
            self._providers[key] = self._build_provider(tier)
        return self._providers[key]

    def _task_tier(self, task: TaskType) -> int:
        if task in _TIER1_TASKS:
            return 1
        if task in _TIER2_TASKS:
            return 2
        return 3

    def route(self, task: TaskType) -> LLMProvider:
        return self._get_provider(self._task_tier(task))

    async def complete(
        self,
        task: TaskType,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 256,
        temperature: float = 0.3,
        trace_id: str | None = None,
        user_id: str | None = None,
    ) -> LLMResponse:
        tier = self._task_tier(task)
        provider = self._get_provider(tier)
        try:
            response = await provider.complete(prompt, system, max_tokens, temperature)
            log.info(
                "llm_complete",
                task=task,
                provider=response.provider,
                model=response.model,
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
            )
            # Fire-and-forget cost tracking
            import asyncio

            asyncio.create_task(
                _push_cost_event(
                    response,
                    task_type=str(task),
                    call_type="chat",
                    trace_id=trace_id,
                    user_id=user_id,
                )
            )
            return response
        except Exception as exc:
            log.warning("llm_tier_failed", task=task, tier=tier, error=str(exc))
            # Only cascade tiers for non-Azure providers
            if not _azure_configured():
                next_tier = {1: 2, 2: 3}.get(tier)
                if next_tier:
                    fallback = self._get_provider(next_tier)
                    log.info("llm_fallback", task=task, from_tier=tier, to_tier=next_tier)
                    return await self._complete_with_fallback(
                        task,
                        prompt,
                        system,
                        max_tokens,
                        temperature,
                        trace_id,
                        user_id,
                        fallback,
                        next_tier,
                    )
            raise

    async def _complete_with_fallback(
        self,
        task: TaskType,
        prompt: str,
        system: str | None,
        max_tokens: int,
        temperature: float,
        trace_id: str | None,
        user_id: str | None,
        fallback: LLMProvider,
        tier: int,
    ) -> LLMResponse:
        response = await fallback.complete(prompt, system, max_tokens, temperature)
        import asyncio

        asyncio.create_task(
            _push_cost_event(
                response,
                task_type=str(task),
                call_type="chat",
                trace_id=trace_id,
                user_id=user_id,
            )
        )
        return response

    async def embed(
        self,
        text: str,
        trace_id: str | None = None,
    ) -> list[float]:
        provider = self._get_provider(1)
        try:
            result = await provider.embed(text)
            # Emit a synthetic LLMResponse for cost tracking
            # embed() returns list[float], not LLMResponse, so we construct it
            _resp = LLMResponse(
                content="",
                input_tokens=len(text.split()),  # rough token approximation for embeddings
                output_tokens=0,
                model=settings.azure_ai_foundry_embed_deployment or settings.llm_tier1_model,
                provider="azure" if _azure_configured() else "gemini",
            )
            import asyncio

            asyncio.create_task(
                _push_cost_event(
                    _resp,
                    task_type=str(TaskType.EMBEDDING),
                    call_type="embedding",
                    trace_id=trace_id,
                )
            )
            return result
        except (NotImplementedError, Exception) as exc:
            if not isinstance(exc, NotImplementedError):
                log.warning("embed_primary_failed", error=str(exc), fallback="openai_or_gemini")
            else:
                log.info("embed_fallback", reason="no Azure embed deployment configured")

            # Try OpenAI first (text-embedding-3-large, same 1536-dim model)
            if settings.openai_api_key:
                try:
                    import asyncio as _asyncio

                    from openai import AsyncOpenAI

                    _oai = AsyncOpenAI(api_key=settings.openai_api_key)
                    _resp_oai = await _asyncio.to_thread(
                        lambda: _oai.embeddings.create(  # type: ignore[no-any-return]
                            input=[text[:8000]],
                            model="text-embedding-3-large",
                        )
                    )
                    result = list(_resp_oai.data[0].embedding)
                    # Pad/truncate to 1536 for DB vector column
                    if len(result) < 1536:
                        result = result + [0.0] * (1536 - len(result))
                    result = result[:1536]
                    _resp = LLMResponse(
                        content="",
                        input_tokens=len(text.split()),
                        output_tokens=0,
                        model="text-embedding-3-large",
                        provider="openai",
                    )
                    import asyncio

                    asyncio.create_task(
                        _push_cost_event(
                            _resp,
                            task_type=str(TaskType.EMBEDDING),
                            call_type="embedding",
                            trace_id=trace_id,
                        )
                    )
                    return result
                except Exception as oai_exc:
                    log.warning("embed_openai_failed", error=str(oai_exc), fallback="gemini")

            from agent.providers.gemini import GeminiProvider

            result = await GeminiProvider().embed(text)
            _resp = LLMResponse(
                content="",
                input_tokens=len(text.split()),
                output_tokens=0,
                model="text-embedding-004",
                provider="gemini",
            )
            import asyncio

            asyncio.create_task(
                _push_cost_event(
                    _resp,
                    task_type=str(TaskType.EMBEDDING),
                    call_type="embedding",
                    trace_id=trace_id,
                )
            )
            return result


router = LLMRouter()


async def embed_image(
    image_bytes: bytes, mime_type: str, trace_id: str | None = None
) -> list[float]:
    """High-level image embedding entrypoint.

    Tries provider-level image embedding (Azure Foundry) then falls back to a
    local CLIP-based embedding helper when available. Raises
    NotImplementedError if no embedding path is available.
    """
    # Try provider-level image embedding when available
    try:
        provider = router._get_provider(1)
        if hasattr(provider, "embed_image"):
            result = await provider.embed_image(image_bytes, mime_type)
            # Emit a lightweight synthetic cost event
            _resp = LLMResponse(
                content="",
                input_tokens=0,
                output_tokens=0,
                model=settings.azure_image_embed_deployment or "",
                provider="azure",
            )
            import asyncio as _asyncio

            _asyncio.create_task(
                _push_cost_event(
                    _resp,
                    task_type=str(TaskType.EMBEDDING),
                    call_type="embedding",
                    trace_id=trace_id,
                )
            )
            return result
    except NotImplementedError:
        log.info("embed_image_not_configured")
    except Exception as exc:
        log.warning("embed_image_provider_failed", error=str(exc))

    # Fallback: try a local CLIP-based helper
    try:
        # run potentially heavy local model off the event loop
        import asyncio as _asyncio

        from agent.image_embeddings import embed_image_local

        result = await _asyncio.to_thread(embed_image_local, image_bytes)
        # Ensure 1536-dim padding/truncation to match DB vector column
        if result is None:
            raise NotImplementedError("local_image_embed_unavailable")
        if len(result) < 1536:
            result = result + [0.0] * (1536 - len(result))
        return result[:1536]
    except Exception as exc:
        log.warning("embed_image_local_failed", error=str(exc))

    raise NotImplementedError("No image embedding available")
