"""Tests for the pool-based discovery agent (ADR-002 Phase 3)."""

from __future__ import annotations

import hashlib
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agent.discovery_agent import DiscoveryAgent
from agent.providers.base import LLMResponse, TaskType
from agent.providers.router import LLMRouter
from agent.serving import rerank

# ── Shared helpers ────────────────────────────────────────────────────────────


def _make_mock_router() -> LLMRouter:
    router = MagicMock(spec=LLMRouter)

    async def mock_complete(task: TaskType, prompt: str, **kwargs) -> LLMResponse:
        return LLMResponse(
            content="You'll love this because it matches your curiosity.",
            input_tokens=50,
            output_tokens=20,
        )

    router.complete = AsyncMock(side_effect=mock_complete)
    router.embed = AsyncMock(return_value=[0.1] * 1536)
    return router  # type: ignore[return-value]


def _make_mock_redis() -> MagicMock:
    redis = MagicMock()
    redis.smembers = AsyncMock(return_value=set())
    redis.sadd = AsyncMock(return_value=1)
    redis.incr = AsyncMock(return_value=1)
    redis.expire = AsyncMock(return_value=True)
    return redis


def _make_mock_connection() -> MagicMock:
    conn = MagicMock()
    conn.__aenter__ = AsyncMock(return_value=conn)
    conn.__aexit__ = AsyncMock(return_value=False)
    return conn


def _make_candidates(n: int, categories: list[str] | None = None) -> list[dict]:
    cats = categories or ["tech", "science"]
    emb = [0.1] * 1536
    return [
        {
            "id": str(uuid.uuid4()),
            "url": f"https://example{i}.com",
            "url_hash": hashlib.sha256(f"https://example{i}.com".encode()).hexdigest(),
            "title": f"Article {i}",
            "description": "A great article",
            "content_summary": "Interesting content summary.",
            "extracted_images": [],
            "quality_score": 0.85,
            "categories": cats,
            "mood_affinities": {},
            "embedding": emb,
            "popularity": 1,
            "last_shown_at": None,
            "ingested_at": None,
            "status": "ready",
        }
        for i in range(n)
    ]


_MOCK_MOOD = {
    "id": "wonder",
    "display_name": "Wonder",
    "embedding": [0.2] * 1536,
    "category_priors": {},
}


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_discovery_agent_returns_results() -> None:
    """Pool path: mood lookup → pgvector search → rerank → blurb cache → results."""
    candidates = _make_candidates(10)
    redis = _make_mock_redis()
    router = _make_mock_router()
    mock_conn = _make_mock_connection()

    with (
        patch(
            "agent.discovery_agent.get_connection",
            new_callable=AsyncMock,
            return_value=mock_conn,
        ),
        patch(
            "agent.discovery_agent.get_mood_by_id",
            new_callable=AsyncMock,
            return_value=_MOCK_MOOD,
        ),
        patch(
            "agent.discovery_agent.get_profile_embedding",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "agent.serving.retrieve_candidates_sql",
            new_callable=AsyncMock,
            return_value=candidates,
        ),
        patch("agent.serving.get_blurbs_from_cache", new_callable=AsyncMock, return_value={}),
        patch("agent.serving.set_blurbs_in_cache", new_callable=AsyncMock),
        patch(
            "agent.discovery_agent.record_discovery_session",
            new_callable=AsyncMock,
            return_value="ds-uuid",
        ),
        patch("agent.discovery_agent.record_discoveries", new_callable=AsyncMock),
    ):
        agent = DiscoveryAgent(redis=redis, llm_router=router)
        results = await agent.run(
            {"sessionId": "test-session-1", "mood": "wonder", "topics": ["tech"]}
        )

    assert len(results) > 0
    for site in results:
        assert "url" in site
        assert "why_blurb" in site
        assert "position" in site
        assert isinstance(site["quality_score"], float)


@pytest.mark.asyncio
async def test_discovery_agent_empty_pool_uses_fallback() -> None:
    """When vector serving is empty, the agent falls back to a quality-ranked batch."""
    redis = _make_mock_redis()
    router = _make_mock_router()
    mock_conn = _make_mock_connection()
    fallback_candidates = _make_candidates(4)

    with (
        patch(
            "agent.discovery_agent.get_connection",
            new_callable=AsyncMock,
            return_value=mock_conn,
        ),
        patch(
            "agent.discovery_agent.get_mood_by_id",
            new_callable=AsyncMock,
            return_value=_MOCK_MOOD,
        ),
        patch(
            "agent.discovery_agent.get_profile_embedding",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "agent.serving.retrieve_candidates_sql",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "agent.discovery_agent.retrieve_fallback_candidates_sql",
            new_callable=AsyncMock,
            return_value=fallback_candidates,
        ),
        patch("agent.serving.get_blurbs_from_cache", new_callable=AsyncMock, return_value={}),
        patch("agent.serving.set_blurbs_in_cache", new_callable=AsyncMock),
        patch("agent.discovery_agent.record_discovery_session", new_callable=AsyncMock),
        patch("agent.discovery_agent.record_discoveries", new_callable=AsyncMock),
    ):
        agent = DiscoveryAgent(redis=redis, llm_router=router)
        results = await agent.run({"sessionId": "test-session-empty", "mood": "wonder"})

    assert len(results) == 3
    assert all("why_blurb" in site for site in results)


@pytest.mark.asyncio
async def test_discovery_agent_missing_mood_uses_fallback() -> None:
    """If mood embeddings are unavailable, discovery still returns a fallback batch."""
    redis = _make_mock_redis()
    router = _make_mock_router()
    mock_conn = _make_mock_connection()
    fallback_candidates = _make_candidates(5)

    with (
        patch(
            "agent.discovery_agent.get_connection",
            new_callable=AsyncMock,
            return_value=mock_conn,
        ),
        patch(
            "agent.discovery_agent.get_mood_by_id",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "agent.discovery_agent.get_profile_embedding",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "agent.discovery_agent.retrieve_fallback_candidates_sql",
            new_callable=AsyncMock,
            return_value=fallback_candidates,
        ),
        patch("agent.serving.get_blurbs_from_cache", new_callable=AsyncMock, return_value={}),
        patch("agent.serving.set_blurbs_in_cache", new_callable=AsyncMock),
        patch("agent.discovery_agent.record_discovery_session", new_callable=AsyncMock),
        patch("agent.discovery_agent.record_discoveries", new_callable=AsyncMock),
    ):
        agent = DiscoveryAgent(redis=redis, llm_router=router)
        results = await agent.run({"sessionId": "test-session-3", "mood": "unknown_mood"})

    assert len(results) == 3


@pytest.mark.asyncio
async def test_discovery_agent_returns_empty_when_fallback_is_empty() -> None:
    """If both vector serving and fallback are empty, discovery still returns an empty batch."""
    redis = _make_mock_redis()
    router = _make_mock_router()
    mock_conn = _make_mock_connection()

    with (
        patch(
            "agent.discovery_agent.get_connection",
            new_callable=AsyncMock,
            return_value=mock_conn,
        ),
        patch(
            "agent.discovery_agent.get_mood_by_id",
            new_callable=AsyncMock,
            return_value=_MOCK_MOOD,
        ),
        patch(
            "agent.discovery_agent.get_profile_embedding",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "agent.serving.retrieve_candidates_sql",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "agent.discovery_agent.retrieve_fallback_candidates_sql",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        agent = DiscoveryAgent(redis=redis, llm_router=router)
        results = await agent.run({"sessionId": "fallback-empty", "mood": "wonder"})

    assert results == []


@pytest.mark.asyncio
async def test_discovery_agent_blurb_cache_hit() -> None:
    """Cached blurbs should be used without calling the LLM."""
    candidates = _make_candidates(3)
    cached = {(c["id"], "wonder"): "Cached blurb!" for c in candidates}
    redis = _make_mock_redis()
    router = _make_mock_router()
    mock_conn = _make_mock_connection()

    with (
        patch(
            "agent.discovery_agent.get_connection",
            new_callable=AsyncMock,
            return_value=mock_conn,
        ),
        patch(
            "agent.discovery_agent.get_mood_by_id",
            new_callable=AsyncMock,
            return_value=_MOCK_MOOD,
        ),
        patch(
            "agent.discovery_agent.get_profile_embedding",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "agent.serving.retrieve_candidates_sql",
            new_callable=AsyncMock,
            return_value=candidates,
        ),
        patch(
            "agent.serving.get_blurbs_from_cache",
            new_callable=AsyncMock,
            return_value=cached,
        ),
        patch("agent.serving.set_blurbs_in_cache", new_callable=AsyncMock),
        patch(
            "agent.discovery_agent.record_discovery_session",
            new_callable=AsyncMock,
            return_value="ds",
        ),
        patch("agent.discovery_agent.record_discoveries", new_callable=AsyncMock),
    ):
        agent = DiscoveryAgent(redis=redis, llm_router=router)
        results = await agent.run({"sessionId": "cache-test", "mood": "wonder"})

    router.complete.assert_not_called()  # type: ignore[attr-defined]
    assert all(r["why_blurb"] == "Cached blurb!" for r in results)


def test_rerank_surprise_injection() -> None:
    """~25% of reranked results should come from the surprise pool."""
    mood_emb = [0.9] * 1536
    on_topic_emb = [0.9] * 1536  # high cosine similarity to mood
    off_topic_emb = [-0.5] + [0.0] * 1535  # low similarity

    on_topic = [
        {
            "id": str(i),
            "url": f"https://tech{i}.com",
            "categories": ["tech"],
            "quality_score": 0.8,
            "embedding": on_topic_emb,
            "popularity": 0,
            "last_shown_at": None,
            "ingested_at": None,
        }
        for i in range(8)
    ]
    off_topic = [
        {
            "id": str(i + 100),
            "url": f"https://food{i}.com",
            "categories": ["food"],
            "quality_score": 0.9,
            "embedding": off_topic_emb,
            "popularity": 0,
            "last_shown_at": None,
            "ingested_at": None,
        }
        for i in range(8)
    ]

    ranked = rerank(
        on_topic + off_topic, mood_emb, None, ["tech"], result_count=8, surprise_factor=0.25
    )
    n_off = sum(1 for s in ranked if "food" in s.get("categories", []))

    assert n_off >= 1, "At least one surprise result expected"
    assert n_off <= 4, "No more than 50% should be off-topic"
