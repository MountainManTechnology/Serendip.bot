"""Serving plane — hot path for pool-based discovery (ADR-002 Phase 3).

Replaces the crawl+LLM hot path with:
  1. retrieve_candidates()  — single pgvector SQL query against site_cache
  2. rerank()               — pure-Python scoring with configurable weights
  3. generate_blurbs_with_cache() — blurb_cache read-through, batched LLM on miss

No crawling, no quality evaluation on the hot path.
"""

from __future__ import annotations

import asyncio
import math
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

import numpy as np

from agent.config import settings
from agent.db import (
    get_blurbs_from_cache,
    retrieve_candidates_sql,
    set_blurbs_in_cache,
)
from agent.logging import log
from agent.providers.base import TaskType
from agent.providers.router import LLMRouter

_WHY_BLURB_SYSTEM = """You are a personalized recommendation engine.
Given a site's content and the user's mood, write a single sentence (max 25 words)
explaining why this user would love this site right now.
Be specific and enthusiastic. Return only the sentence."""


# ── Helpers ──────────────────────────────────────────────────────────────────


def _extract_domain(url: str) -> str:
    """Extract netloc from a URL for per-domain result capping."""
    try:
        return urlparse(url).netloc.lower()
    except Exception:
        return ""


# ── Vector math ───────────────────────────────────────────────────────────────


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Return cosine similarity in [-1, 1]. Returns 0 on empty or mismatched input."""
    if not a or not b or len(a) != len(b):
        return 0.0
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    norm_a = float(np.linalg.norm(va))
    norm_b = float(np.linalg.norm(vb))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))


def _blend_embeddings(
    mood_embedding: list[float],
    profile_embedding: list[float] | None,
    mood_weight: float = 0.6,
    profile_weight: float = 0.4,
) -> list[float]:
    """Weighted blend of mood + profile embeddings for the pgvector query vector."""
    if not profile_embedding:
        return mood_embedding
    blended = [
        mood_weight * m + profile_weight * p for m, p in zip(mood_embedding, profile_embedding)
    ]
    return blended


# ── Candidate retrieval ───────────────────────────────────────────────────────


async def retrieve_candidates(
    conn: Any,
    mood_embedding: list[float],
    profile_embedding: list[float] | None,
    topics: list[str],
    exclude_url_hashes: list[str],
    limit: int = 60,
) -> list[dict[str, Any]]:
    """Fetch up to `limit` candidate sites from site_cache using pgvector ANN search.

    Query vector is a weighted blend of mood and profile embeddings.
    """
    query_vec = _blend_embeddings(mood_embedding, profile_embedding)
    return await retrieve_candidates_sql(conn, query_vec, exclude_url_hashes, limit=limit)


# ── Reranker ──────────────────────────────────────────────────────────────────


def _recency_boost(ingested_at: Any) -> float:
    """Small boost for recently ingested sites (max 1.0 for today, decays to 0 after 90 days)."""
    if not ingested_at:
        return 0.0
    if isinstance(ingested_at, str):
        try:
            ingested_at = datetime.fromisoformat(ingested_at)
        except ValueError:
            return 0.0
    if ingested_at.tzinfo is None:
        ingested_at = ingested_at.replace(tzinfo=UTC)
    age_days: int = (datetime.now(UTC) - ingested_at).days
    return max(0.0, 1.0 - age_days / 90.0)


def _popularity_penalty(popularity: int) -> float:
    """Logarithmic penalty: 0 for new sites, capped at 0.2 for heavily served ones."""
    if popularity <= 2:
        return 0.0
    return min(0.2, 0.07 * math.log2(popularity))


def _session_staleness(last_shown_at: Any) -> float:
    """Penalty for sites shown recently in any session (max 0.2 for shown today)."""
    if not last_shown_at:
        return 0.0
    if isinstance(last_shown_at, str):
        try:
            last_shown_at = datetime.fromisoformat(last_shown_at)
        except ValueError:
            return 0.0
    if last_shown_at.tzinfo is None:
        last_shown_at = last_shown_at.replace(tzinfo=UTC)
    age_days: int = (datetime.now(UTC) - last_shown_at).days
    return max(0.0, 0.2 - age_days * 0.02)


def _score_site(
    site: dict[str, Any],
    mood_embedding: list[float],
    profile_embedding: list[float] | None,
    topics: list[str],
    *,
    w_mood: float,
    w_profile: float,
    w_topic: float,
    w_recency: float,
) -> float:
    emb = site.get("embedding")
    mood_sim = cosine_similarity(emb or [], mood_embedding) if emb else 0.0
    profile_sim = (
        cosine_similarity(emb or [], profile_embedding) if (emb and profile_embedding) else 0.0
    )
    cats = set(site.get("categories") or [])
    topic_overlap = len(cats & set(topics)) / max(len(topics), 1) if topics else 0.0
    recency = _recency_boost(site.get("ingested_at"))
    pop_pen = _popularity_penalty(int(site.get("popularity") or 0))
    stale_pen = _session_staleness(site.get("last_shown_at"))

    return (
        w_mood * mood_sim
        + w_profile * profile_sim
        + w_topic * topic_overlap
        + w_recency * recency
        - 0.10 * pop_pen
        - 0.05 * stale_pen
    )


def rerank(
    candidates: list[dict[str, Any]],
    mood_embedding: list[float],
    profile_embedding: list[float] | None,
    topics: list[str],
    result_count: int,
    surprise_factor: float = 0.25,
) -> list[dict[str, Any]]:
    """Score, sort, and inject surprise into candidate list.

    Weights are read from settings (env vars) so they can be tuned without code changes.
    """
    w_mood = float(getattr(settings, "rerank_mood_weight", 0.50))
    w_profile = (
        float(getattr(settings, "rerank_profile_weight", 0.30)) if profile_embedding else 0.0
    )
    w_topic = float(getattr(settings, "rerank_topic_weight", 0.15))
    w_recency = float(getattr(settings, "rerank_recency_weight", 0.05))

    # Attach scores
    scored = []
    for site in candidates:
        s = _score_site(
            site,
            mood_embedding,
            profile_embedding,
            topics,
            w_mood=w_mood,
            w_profile=w_profile,
            w_topic=w_topic,
            w_recency=w_recency,
        )
        scored.append((s, site))
    scored.sort(key=lambda x: x[0], reverse=True)

    # Enforce per-domain cap so the same site can't dominate a stumble batch
    max_per_domain = int(getattr(settings, "max_results_per_domain", 2))
    domain_counts: dict[str, int] = {}
    deduped: list[tuple[float, dict[str, Any]]] = []
    for score, site in scored:
        domain = _extract_domain(site.get("url") or "")
        if domain and domain_counts.get(domain, 0) >= max_per_domain:
            continue
        domain_counts[domain] = domain_counts.get(domain, 0) + 1
        deduped.append((score, site))
    scored = deduped

    n_surprise = max(1, int(result_count * surprise_factor))
    n_main = result_count - n_surprise

    # Main results: top-scored sites
    main = [s for _, s in scored[:n_main]]

    # Surprise: high-quality sites from the bottom of the ranked list
    # (off-profile but good — serendipity pick)
    surprise_pool = [s for _, s in scored[n_main:]]
    surprise_pool.sort(key=lambda s: float(s.get("quality_score") or 0), reverse=True)
    surprise = surprise_pool[:n_surprise]

    # Mark surprise picks for feedback tracking
    surprise = [{**item, "is_surprise": True} for item in surprise]

    results = main + surprise
    for i, site in enumerate(results):
        site["position"] = i
    return results


# ── Blurb cache ───────────────────────────────────────────────────────────────


async def generate_blurbs_with_cache(
    conn: Any,
    sites: list[dict[str, Any]],
    mood_id: str,
    llm_router: LLMRouter,
) -> list[dict[str, Any]]:
    """Return sites with why_blurb populated, using blurb_cache as a read-through.

    Cache hits: instant.
    Cache misses: one batched Tier-1 LLM call for all missing sites.
    """
    if not sites:
        return sites

    # Build lookup for which sites need generation
    site_ids = [s.get("id") for s in sites if s.get("id")]
    pairs = [(sid, mood_id) for sid in site_ids if sid]

    cached_blurbs = await get_blurbs_from_cache(conn, pairs)
    hits = len(cached_blurbs)

    # Identify cache misses
    to_generate = [s for s in sites if (s.get("id"), mood_id) not in cached_blurbs]
    log.info("blurb_cache_check", total=len(sites), hits=hits, misses=len(to_generate))

    # Batch-generate missing blurbs
    generated: dict[str, str] = {}
    if to_generate:
        try:
            blurb_tasks = [_generate_single_blurb(s, mood_id, llm_router) for s in to_generate]
            try:
                results = await asyncio.wait_for(
                    asyncio.gather(*blurb_tasks, return_exceptions=True),
                    timeout=4.0,
                )
            except TimeoutError:
                log.warning("blurb_batch_timeout", count=len(to_generate))
                results = []

            new_cache_entries: list[dict[str, Any]] = []
            for site, result in zip(to_generate, results):
                if isinstance(result, BaseException):
                    log.warning("blurb_gen_failed", url=site.get("url"), error=str(result))
                else:
                    blurb, model = result
                    generated[site.get("id", "")] = blurb
                    if site.get("id"):
                        new_cache_entries.append(
                            {
                                "site_cache_id": site["id"],
                                "mood_id": mood_id,
                                "blurb": blurb,
                                "model": model,
                            }
                        )

            if new_cache_entries:
                try:
                    await set_blurbs_in_cache(conn, new_cache_entries)
                except Exception as exc:
                    log.warning("blurb_cache_write_failed", error=str(exc))

        except Exception as exc:
            log.warning("blurb_batch_failed", error=str(exc))

    # Assemble final results — fall back to pre-indexed description if blurb unavailable
    output = []
    for site in sites:
        site_id = site.get("id", "")
        blurb = (
            cached_blurbs.get((site_id, mood_id))
            or generated.get(site_id)
            or site.get("description")
            or site.get("content_summary")
            or ""
        )
        output.append({**site, "why_blurb": blurb})

    return output


async def _generate_single_blurb(
    site: dict[str, Any],
    mood_id: str,
    llm_router: LLMRouter,
) -> tuple[str, str]:
    """Generate a single why-blurb for a site+mood pair. Returns (blurb, model_name)."""
    summary = (site.get("content_summary") or "")[:300]
    prompt = (
        f"Mood: {mood_id}\n\n"
        f"Site: {site.get('title', '')}\n"
        f"Categories: {', '.join(site.get('categories') or [])}\n"
        f"Summary: {summary}"
    )
    response = await llm_router.complete(
        TaskType.WHY_BLURB,
        prompt=prompt,
        system=_WHY_BLURB_SYSTEM,
        max_tokens=50,
    )
    return response.content.strip(), response.model
