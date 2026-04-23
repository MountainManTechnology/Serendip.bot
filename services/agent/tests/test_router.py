"""Unit tests for the LLM router — mocked providers, no real API calls."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from agent.providers.base import LLMResponse, TaskType
from agent.providers.router import _TIER1_TASKS, _TIER2_TASKS, _TIER3_TASKS, LLMRouter


def _mock_provider(content: str = "ok", input_tokens: int = 10) -> MagicMock:
    provider = MagicMock()
    provider.complete = AsyncMock(
        return_value=LLMResponse(
            content=content,
            input_tokens=input_tokens,
            output_tokens=5,
            model="mock-model",
            provider="mock",
        )
    )
    provider.embed = AsyncMock(return_value=[0.1] * 1536)
    return provider


@pytest.mark.parametrize("task", list(_TIER1_TASKS))
def test_tier1_tasks_route_to_tier1(task: TaskType) -> None:
    router = LLMRouter()
    mock = _mock_provider()
    router._providers["tier1"] = mock  # type: ignore[assignment]
    provider = router.route(task)
    assert provider is mock


@pytest.mark.parametrize("task", list(_TIER2_TASKS))
def test_tier2_tasks_route_to_tier2(task: TaskType) -> None:
    router = LLMRouter()
    mock = _mock_provider()
    router._providers["tier2"] = mock  # type: ignore[assignment]
    provider = router.route(task)
    assert provider is mock


@pytest.mark.parametrize("task", list(_TIER3_TASKS))
def test_tier3_tasks_route_to_tier3(task: TaskType) -> None:
    router = LLMRouter()
    mock = _mock_provider()
    router._providers["tier3"] = mock  # type: ignore[assignment]
    provider = router.route(task)
    assert provider is mock


@pytest.mark.asyncio
async def test_complete_returns_response() -> None:
    router = LLMRouter()
    mock = _mock_provider(content="result text", input_tokens=20)
    router._providers["tier1"] = mock  # type: ignore[assignment]

    response = await router.complete(TaskType.QUALITY_EVAL, prompt="test prompt")

    assert response.content == "result text"
    assert response.input_tokens == 20
    mock.complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_fallback_on_tier1_failure() -> None:
    router = LLMRouter()

    tier1 = MagicMock()
    tier1.complete = AsyncMock(side_effect=RuntimeError("API rate limited"))

    tier2 = _mock_provider(content="fallback result")
    router._providers["tier1"] = tier1  # type: ignore[assignment]
    router._providers["tier2"] = tier2  # type: ignore[assignment]

    response = await router.complete(TaskType.QUALITY_EVAL, prompt="test")

    assert response.content == "fallback result"
    tier1.complete.assert_awaited_once()
    tier2.complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_embed_delegates_to_tier1() -> None:
    router = LLMRouter()
    mock = _mock_provider()
    router._providers["tier1"] = mock  # type: ignore[assignment]

    result = await router.embed("some text to embed")

    assert result == [0.1] * 1536
    mock.embed.assert_awaited_once_with("some text to embed")


@pytest.mark.asyncio
async def test_complete_with_system_prompt() -> None:
    router = LLMRouter()
    mock = _mock_provider(content='{"quality_score": 0.8, "categories": ["tech"]}')
    router._providers["tier1"] = mock  # type: ignore[assignment]

    response = await router.complete(
        TaskType.QUALITY_EVAL,
        prompt="page content here",
        system="You are a quality evaluator.",
        max_tokens=128,
    )

    assert "quality_score" in response.content
    _, kwargs = mock.complete.call_args
    assert (
        kwargs.get("system") == "You are a quality evaluator."
        or mock.complete.call_args[0][1] == "You are a quality evaluator."
    )
