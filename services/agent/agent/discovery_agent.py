"""Discovery agent orchestrator — full flow from URL selection to ranked results."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urlparse

from redis.asyncio import Redis

from agent.config import settings
from agent.crawler import Crawler, CrawlResult
from agent.db import (
    get_connection,
    get_mood_by_id,
    get_profile_embedding,
    record_discoveries,
    record_discovery_session,
    retrieve_fallback_candidates_sql,
)
from agent.logging import log
from agent.providers.base import TaskType
from agent.providers.router import LLMRouter
from agent.providers.router import router as default_router

# Domains that should never enter the seed pool (social media, e-commerce, login pages, etc.)
_SEED_DOMAIN_BLOCKLIST = frozenset(
    {
        "twitter.com",
        "x.com",
        "facebook.com",
        "instagram.com",
        "tiktok.com",
        "linkedin.com",
        "pinterest.com",
        "reddit.com",
        "threads.net",
        "youtube.com",
        "youtu.be",
        "amazon.com",
        "ebay.com",
        "etsy.com",
        "walmart.com",
        "target.com",
        "gap.com",
        "oldnavy.com",
        "shopify.com",
        "apple.com",
        "play.google.com",
        "apps.apple.com",
        "google.com",
        "bing.com",
        "yahoo.com",
        "duckduckgo.com",
        "bit.ly",
        "t.co",
        "goo.gl",
        "amzn.to",
    }
)


def _is_seedworthy(url: str) -> bool:
    """Return False for URLs whose domain is on the blocklist."""
    try:
        host = urlparse(url).hostname or ""
        # Strip www. prefix for matching
        if host.startswith("www."):
            host = host[4:]
        # Check against blocklist and subdomains (e.g. shop.gap.com)
        return not any(host == d or host.endswith("." + d) for d in _SEED_DOMAIN_BLOCKLIST)
    except Exception:
        return False


def _domain_of(url: str) -> str:
    """Extract the registrable domain from a URL.

    e.g. www.quantamagazine.org -> quantamagazine.org
    """
    host = urlparse(url).hostname or ""
    if host.startswith("www."):
        host = host[4:]
    return host


def _is_article_link(url: str, base_domain: str) -> bool:
    """Return True if the URL looks like an article.

    Checks for a path with 2+ segments on the same domain.
    """
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if host.startswith("www."):
        host = host[4:]
    if host != base_domain:
        return False
    path = parsed.path.strip("/")
    # Article URLs have meaningful path segments (not just / or /category)
    return len(path) > 10 and "/" in path


QUALITY_EVAL_SYSTEM = """You are a web content quality evaluator for a discovery platform.
Evaluate the website/publication based on the provided page content. Even if this is a
homepage with mostly navigation and headlines, assess the overall quality of the site itself.
Return a JSON object with:
- quality_score: float 0.0–1.0 (0=spam/e-commerce/login-wall, 1=exceptional original content).
  Score ≥0.7 for sites with original articles, essays, or educational content.
  Score ≥0.5 for curated/aggregated content sites.
  Score <0.3 only for pure e-commerce, login walls, or empty pages.
- categories: list of 1–3 topic tags from [tech, science, art, music, culture, food, travel,
  health, business, design, gaming, film, literature, nature, history, philosophy, humor]
- reason: one sentence explaining the score

Only return valid JSON. No markdown fences."""

SUMMARY_SYSTEM = """You are a content summarizer. Extract the most interesting,
informative parts of the provided text into a 2–3 paragraph readable summary.
Be engaging — write for curious readers who want to be delighted.
Return plain text only."""

WHY_BLURB_SYSTEM = """You are a personalized recommendation engine.
Given a site's content and the user's interest categories, write a single sentence
(max 25 words) explaining why this specific user would love this site.
Be specific and enthusiastic. Return only the sentence."""


class DiscoveryAgent:
    def __init__(self, redis: Redis, llm_router: LLMRouter | None = None) -> None:  # type: ignore[type-arg]
        self._redis = redis
        self._router = llm_router or default_router
        self._crawler = Crawler()

    async def run(
        self,
        payload: dict[str, Any],
        on_candidates_ready: Callable[[list[dict[str, Any]]], Awaitable[None]] | None = None,
    ) -> list[dict[str, Any]]:
        session_id: str = payload.get("sessionId", "")
        mood: str | None = payload.get("mood")
        topics: list[str] = payload.get("topics") or []

        log.info("discovery_start", session_id=session_id, mood=mood, topics=topics)
        return await self._run_pool_serving(payload, on_candidates_ready=on_candidates_ready)

    async def _evaluate_single(self, crawl: CrawlResult) -> dict[str, Any] | None:
        try:
            content_snippet = f"Title: {crawl.title}\n\n{crawl.content_text[:2000]}"

            # Quality + categories
            eval_response = await self._router.complete(
                TaskType.QUALITY_EVAL,
                prompt=content_snippet,
                system=QUALITY_EVAL_SYSTEM,
                max_tokens=128,
            )
            eval_data = json.loads(eval_response.content)
            quality_score: float = float(eval_data.get("quality_score", 0))
            categories: list[str] = eval_data.get("categories", [])

            # Content summary
            summary_response = await self._router.complete(
                TaskType.CONTENT_SUMMARY,
                prompt=crawl.content_text[:3000],
                system=SUMMARY_SYSTEM,
                max_tokens=300,
            )

            # Embedding (optional — falls back to None if no embedding provider configured)
            embed_text = f"{crawl.title} {' '.join(categories)} {crawl.content_text[:500]}"
            try:
                embedding: list[float] | None = await self._router.embed(embed_text)
            except Exception:
                embedding = None

            return {
                "url": crawl.url,
                "url_hash": crawl.url_hash,
                "title": crawl.title,
                "description": crawl.description,
                "content_summary": summary_response.content,
                "content_html": crawl.content_html,
                "extracted_images": crawl.extracted_images,
                "quality_score": quality_score,
                "categories": categories,
                "embedding": embedding,
                "why_blurb": "",
            }
        except Exception as exc:
            log.warning("evaluate_failed", url=crawl.url, error=str(exc))
            return None

    async def _retrieve_fallback_candidates(
        self,
        conn: Any,
        mood: str,
        topics: list[str],
        shown_hashes: list[str],
    ) -> list[dict[str, Any]]:
        """Best-effort fallback when pool serving cannot build a vector-ranked batch."""
        quality_floor = max(settings.discovery_min_quality_score, 0.5)
        candidates = await retrieve_fallback_candidates_sql(
            conn,
            mood,
            topics,
            shown_hashes,
            quality_min=quality_floor,
            limit=60,
        )
        if candidates or quality_floor <= settings.discovery_min_quality_score:
            return candidates

        return await retrieve_fallback_candidates_sql(
            conn,
            mood,
            topics,
            shown_hashes,
            quality_min=settings.discovery_min_quality_score,
            limit=60,
        )

    async def _run_pool_serving(
        self,
        payload: dict[str, Any],
        on_candidates_ready: Callable[[list[dict[str, Any]]], Awaitable[None]] | None = None,
    ) -> list[dict[str, Any]]:
        """Pool-based hot path (ADR-002 Phase 3): vector search → rerank → blurb cache.

        No crawling, no quality evaluation on the hot path.
        Enabled by DISCOVERY_USE_POOL=true.

        If ``on_candidates_ready`` is provided it is awaited immediately after
        reranking — before blurb generation and DB persistence — so the caller
        can write job status to Redis and unblock the user without waiting for
        LLM blurb calls.
        """
        from agent.serving import generate_blurbs_with_cache, rerank, retrieve_candidates

        session_id: str = payload.get("sessionId", "")
        mood: str = payload.get("mood") or "wonder"
        topics: list[str] = payload.get("topics") or []

        # Exclude already-shown URLs for this session
        shown_key = f"session:shown:{session_id}"
        shown_urls = await self._redis.smembers(shown_key)  # type: ignore[misc]
        shown_hashes = [hashlib.sha256(url.encode()).hexdigest() for url in shown_urls]

        conn = await get_connection()
        used_fallback = False
        async with conn:
            # Look up mood embedding; if it is unavailable, fall back to a non-vector batch
            mood_data = await get_mood_by_id(conn, mood)
            mood_embedding: list[float] = mood_data["embedding"] if mood_data else []
            if not mood_embedding:
                log.warning("mood_embedding_missing", mood=mood, session_id=session_id)

            profile_embedding = await get_profile_embedding(conn, session_id)

            candidates: list[dict[str, Any]] = []
            if mood_embedding:
                # Vector search
                candidates = await retrieve_candidates(
                    conn,
                    mood_embedding,
                    profile_embedding,
                    topics,
                    shown_hashes,
                    limit=60,
                )
                if not candidates:
                    log.warning("pool_empty", mood=mood, session_id=session_id)

            if not candidates:
                used_fallback = True
                candidates = await self._retrieve_fallback_candidates(
                    conn, mood, topics, shown_hashes
                )
                if not candidates:
                    log.warning("fallback_pool_empty", mood=mood, session_id=session_id)
                    if on_candidates_ready:
                        await on_candidates_ready([])
                    return []
                log.info(
                    "fallback_pool_used",
                    mood=mood,
                    session_id=session_id,
                    count=len(candidates),
                )

            if mood_embedding:
                # Rerank with configurable weights (includes domain dedup)
                ranked = rerank(
                    candidates,
                    mood_embedding,
                    profile_embedding,
                    topics,
                    result_count=settings.discovery_result_count,
                    surprise_factor=settings.discovery_surprise_factor,
                )
                top = ranked[: settings.discovery_result_count]
            else:
                # No mood embedding — apply domain dedup manually so the same
                # site can't dominate all result slots on the fallback path
                max_per_domain = int(getattr(settings, "max_results_per_domain", 2))
                domain_counts: dict[str, int] = {}
                deduped: list[dict[str, Any]] = []
                for site in candidates:
                    domain = _domain_of(site.get("url") or "")
                    if domain and domain_counts.get(domain, 0) >= max_per_domain:
                        continue
                    domain_counts[domain] = domain_counts.get(domain, 0) + 1
                    deduped.append(site)
                    if len(deduped) >= settings.discovery_result_count:
                        break
                top = deduped

            # ── Early result notification ──────────────────────────────────
            # Fire the callback immediately after reranking with description
            # fallbacks so the caller can write Redis and unblock the user
            # before we spend time on LLM blurb calls or DB persistence.
            if on_candidates_ready:
                fast_results = [
                    {
                        **site,
                        "why_blurb": (site.get("description") or site.get("content_summary") or ""),
                    }
                    for site in top
                ]
                try:
                    await on_candidates_ready(fast_results)
                except Exception as exc:
                    log.warning("on_candidates_ready_failed", error=str(exc))
            # ──────────────────────────────────────────────────────────────

            # Blurb cache read-through (cached per site+mood, 30-day TTL)
            results = await generate_blurbs_with_cache(conn, top, mood, self._router)

            # Persist discovery session
            try:
                ds_id = await record_discovery_session(conn, session_id, mood, topics)
                if ds_id:
                    await record_discoveries(conn, ds_id, results)
            except Exception as exc:
                log.warning("db_persist_failed", error=str(exc))

        # Mark shown URLs + track popularity
        for site in results:
            if url := site.get("url"):
                await self._redis.sadd(shown_key, url)  # type: ignore[misc]
                url_hash_val = site.get("url_hash") or hashlib.sha256(url.encode()).hexdigest()
                await self._redis.incr(f"site:served:{url_hash_val}")  # type: ignore[misc]
        await self._redis.expire(shown_key, 90 * 86400)  # type: ignore[misc]

        log.info(
            "pool_serving_complete",
            session_id=session_id,
            count=len(results),
            used_fallback=used_fallback,
        )
        return results

    async def _shadow_log_pool(
        self, payload: dict[str, Any], legacy_results: list[dict[str, Any]]
    ) -> None:
        """Fire-and-forget: run pool path and log overlap with legacy results for comparison."""
        try:
            pool_results = await self._run_pool_serving(payload)
            legacy_urls = {s.get("url") for s in legacy_results}
            pool_urls = {s.get("url") for s in pool_results}
            overlap = len(legacy_urls & pool_urls)
            log.info(
                "shadow_log_pool",
                legacy_count=len(legacy_results),
                pool_count=len(pool_results),
                overlap=overlap,
                overlap_pct=round(overlap / max(len(legacy_results), 1) * 100, 1),
            )
        except Exception as exc:
            log.warning("shadow_log_failed", error=str(exc))


# Bootstrap seeds for cold-start (before Redis is populated)
_BOOTSTRAP_SEEDS = [
    "https://www.gutenberg.org",
    "https://astronomy.com",
    "https://hackaday.com",
    "https://kottke.org",
    "https://longform.org",
    "https://www.themarginalian.org",
    "https://waitbutwhy.com",
    "https://www.nautil.us",
    "https://aeon.co",
    "https://www.openculture.com",
    "https://www.atlasobscura.com",
    "https://lettersofnote.com",
    "https://www.smithsonianmag.com",
    "https://publicdomainreview.org",
    "https://www.mentalfloss.com",
    "https://www.darksky.org",
    "https://daily.jstor.org",
    "https://www.bbc.com/future",
    "https://99percentinvisible.org",
    "https://www.laphamsquarterly.org",
    "https://restofworld.org",
    "https://pudding.cool",
    "https://neal.fun",
    "https://www.quantamagazine.org",
    "https://www.theverge.com",
    "https://lithub.com",
    "https://www.wired.com/category/science",
    "https://www.vox.com/unexplainable",
    "https://www.eater.com",
    "https://hyperallergic.com",
]
