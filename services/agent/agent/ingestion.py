"""Ingestion plane — background URL evaluation and quality gating.

All ingestion is decoupled from the serving hot path.  URLs enter via
`ingest_attempts` (inserted by outbound-link harvesting, RSS, sitemaps, or
seed YAML loading).  This module drains that queue, evaluates each URL, and
writes passing sites to `site_cache` with status='ready'.

Celery task entry point: agent.tasks.ingest_batch
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from agent.crawler import Crawler
from agent.db import (
    backfill_mood_affinities_batch,
    get_connection,
    get_pending_ingest_batch,
    reset_stuck_crawling,
    update_ingest_status,
    upsert_site_cache,
)
from agent.logging import log
from agent.providers.base import TaskType
from agent.providers.router import router as default_router
from agent.config import settings
from agent.telemetry import get_worker_id, now_iso, push_event

# ── Quality-gate constants ─────────────────────────────────────────────────────

QUALITY_MIN_SCORE: float = 0.65
QUALITY_MIN_WORD_COUNT: int = 200
ACCEPT_LANGUAGES: frozenset[str] = frozenset({"en"})
ACCEPT_CONTENT_TYPES: frozenset[str] = frozenset({"article", "essay", "interactive", "reference"})

# Concurrency for the crawl + quality-eval stage is read from agent settings
# `eval_concurrency` (default 6). Tunable via environment variable.

_PAYWALL_SIGNALS = [
    "subscribe to continue",
    "sign in to read",
    "create an account to read",
    "this content is for subscribers",
    "to read this article, please",
    "premium content",
    "members only",
    "login to access",
    "register to read",
]

_QUALITY_EVAL_SYSTEM = """You are a web content quality evaluator for a discovery platform.
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

_SUMMARY_SYSTEM = """You are a content summarizer. Extract the most interesting,
informative parts of the provided text into a 2–3 paragraph readable summary.
Be engaging — write for curious readers who want to be delighted.
Return plain text only."""


# ── Quality gate ──────────────────────────────────────────────────────────────


def _is_behind_paywall(content_text: str) -> bool:
    """Heuristic paywall detection from the first 500 chars of content."""
    sample = content_text[:500].lower()
    return any(signal in sample for signal in _PAYWALL_SIGNALS)


def quality_gate(site: dict[str, Any]) -> tuple[bool, str | None]:
    """Return (passed, reject_reason) for an evaluated site dict.

    All checks must pass for the site to enter the pool.
    """
    score = float(site.get("quality_score", 0))
    if score < QUALITY_MIN_SCORE:
        return False, f"quality_score={score:.2f}<{QUALITY_MIN_SCORE}"

    lang = site.get("language", "en")
    if lang not in ACCEPT_LANGUAGES:
        return False, f"language={lang}"

    content_type = site.get("content_type", "article")
    if content_type not in ACCEPT_CONTENT_TYPES:
        return False, f"content_type={content_type}"

    word_count = int(site.get("word_count", 0))
    if word_count < QUALITY_MIN_WORD_COUNT:
        return False, f"word_count={word_count}<{QUALITY_MIN_WORD_COUNT}"

    if site.get("behind_paywall", False):
        return False, "behind_paywall"

    return True, None


# ── URL evaluator ─────────────────────────────────────────────────────────────


async def evaluate_url(url: str) -> dict[str, Any] | None:
    """Crawl and LLM-evaluate a single URL.

    Returns a site dict shaped for upsert_site_cache, or None on crawl failure.
    Does NOT apply the quality gate — call quality_gate() separately.
    """
    # Crawl first, then run a *single* inexpensive quality evaluation LLM call.
    # Defer the heavier `content_summary` and `embed` calls until after the
    # quality gate passes. This reduces tokens and latency for low-quality pages.
    crawler = Crawler()
    crawl = await crawler.crawl_url(url)

    if crawl.error or not crawl.content_text:
        log.info("ingest_crawl_skipped", url=url, error=crawl.error)
        return None

    try:
        content_snippet = f"Title: {crawl.title}\n\n{crawl.content_text[:2000]}"

        eval_response = await default_router.complete(
            TaskType.QUALITY_EVAL,
            prompt=content_snippet,
            system=_QUALITY_EVAL_SYSTEM,
            max_tokens=128,
        )
        eval_data = json.loads(eval_response.content)
        quality_score: float = float(eval_data.get("quality_score", 0))
        categories: list[str] = eval_data.get("categories", [])

        # Return a minimal site dict including the raw crawl text so callers
        # can defer summary/embed until after quality gating.
        return {
            "url": url,
            "url_hash": crawl.url_hash,
            "title": crawl.title,
            "description": crawl.description,
            "content_summary": None,
            "content_html": crawl.content_html,
            "extracted_images": crawl.extracted_images,
            "quality_score": quality_score,
            "categories": categories,
            "embedding": None,
            "language": crawl.language,
            "content_type": "article",
            "word_count": crawl.word_count,
            "behind_paywall": _is_behind_paywall(crawl.content_text),
            "why_blurb": "",
            "_raw_text": crawl.content_text,
        }

    except Exception as exc:
        log.warning("ingest_evaluate_failed", url=url, error=str(exc))
        return None


# ── Ingest batch runner ───────────────────────────────────────────────────────


async def run_ingest_batch(batch_size: int = 10) -> dict[str, int]:
    """Drain one batch from ingest_attempts and write passing sites to site_cache.

    Called by the `ingest_batch` Celery task every 5 minutes.
    """
    conn = await get_connection()
    accepted = rejected = errored = 0

    async with conn:
        # Recover any rows stuck in 'crawling' from a previous timed-out batch
        recovered = await reset_stuck_crawling(conn)
        if recovered:
            log.info("ingest_stuck_recovered", count=recovered)

        batch = await get_pending_ingest_batch(conn, batch_size)
        if not batch:
            log.info("ingest_batch_empty")
            return {"processed": 0, "accepted": 0, "rejected": 0, "errored": 0}

        log.info("ingest_batch_start", count=len(batch))

        # Run the expensive crawl+quality-eval calls concurrently (bounded).
        eval_concurrency = int(getattr(settings, "eval_concurrency", 6))
        sem = asyncio.Semaphore(eval_concurrency)

        async def _eval_item(item: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None, int]:
            async with sem:
                t0 = time.perf_counter()
                site = await evaluate_url(item["url"])
                t1 = time.perf_counter()
                eval_ms = int((t1 - t0) * 1000)
                return item, site, eval_ms

        tasks = [asyncio.create_task(_eval_item(it)) for it in batch]
        results = await asyncio.gather(*tasks)

        # Sequentially apply quality gate and perform DB writes.
        inserted_with_embedding = 0
        # accumulators for simple per-batch metrics
        total_eval_ms = 0
        eval_count = 0
        total_summary_ms = 0
        summary_count = 0
        total_embed_ms = 0
        embed_count = 0

        for item, site, eval_ms in results:
            url = item["url"]
            url_hash = item["url_hash"]

            # accumulate eval timing
            try:
                if eval_ms is not None:
                    total_eval_ms += int(eval_ms)
                    eval_count += 1
            except Exception:
                pass

            if site is None:
                await update_ingest_status(conn, url_hash, "errored", "crawl_or_eval_failed")
                errored += 1
                continue

            passed, reason = quality_gate(site)
            if not passed:
                await update_ingest_status(conn, url_hash, "rejected", reason)
                log.info("ingest_rejected", url=url, reason=reason)
                rejected += 1
                continue

            # Finalize summary and embedding only for passing items to save tokens/time.
            try:
                # measure summary timing
                if not site.get("content_summary"):
                    t_sum0 = time.perf_counter()
                    summary_response = await default_router.complete(
                        TaskType.CONTENT_SUMMARY,
                        prompt=site.get("_raw_text", "")[:3000],
                        system=_SUMMARY_SYSTEM,
                        max_tokens=300,
                    )
                    t_sum1 = time.perf_counter()
                    summary_ms = int((t_sum1 - t_sum0) * 1000)
                    total_summary_ms += summary_ms
                    summary_count += 1
                    site["content_summary"] = summary_response.content

                try:
                    t_emb0 = time.perf_counter()
                    embed_text = f"{site.get('title','')} {' '.join(site.get('categories', []))} {site.get('_raw_text','')[:500]}"
                    embedding = await default_router.embed(embed_text)
                    t_emb1 = time.perf_counter()
                    embed_ms = int((t_emb1 - t_emb0) * 1000)
                    total_embed_ms += embed_ms
                    embed_count += 1
                    site["embedding"] = embedding
                except Exception:
                    site["embedding"] = None

                # Remove ephemeral raw text before DB write
                site.pop("_raw_text", None)

                site_id = await upsert_site_cache(conn, site)
                if site.get("embedding") and site_id:
                    inserted_with_embedding += 1

                await update_ingest_status(conn, url_hash, "evaluated")
                accepted += 1
                log.info("ingest_accepted", url=url, score=site["quality_score"])
            except Exception as exc:
                log.warning("ingest_db_write_failed", url=url, error=str(exc))
                await update_ingest_status(conn, url_hash, "errored", f"db_write_failed:{exc!s}")
                errored += 1

        # Batch backfill affinities for any newly inserted rows with embeddings
        if inserted_with_embedding:
            try:
                await backfill_mood_affinities_batch(conn, batch_size=inserted_with_embedding)
            except Exception:
                log.warning("backfill_affinities_failed")

        # Publish simple ingest metrics to Redis for the admin UI (best-effort)
        try:
            import redis.asyncio as aioredis

            r = aioredis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]
            try:
                # set current eval concurrency as a short-lived key
                await r.setex("metrics:ingest:eval_concurrency", 90, str(eval_concurrency))

                # push an agent_task event with batch-level duration placeholders
                # include a few useful counts so the telemetry drain can persist
                await push_event(
                    r,
                    {
                        "type": "agent_task",
                        "ts": now_iso(),
                        "trace_id": None,
                        "worker_id": get_worker_id(),
                        "task_name": "agent.tasks.ingest_batch.inner",
                        "queue": "discovery",
                        "status": "metrics",
                        "duration_ms": None,
                        "retries": 0,
                        "error_type": None,
                        "processed": accepted + rejected + errored,
                        "accepted": accepted,
                        "rejected": rejected,
                        "errored": errored,
                        "avg_eval_ms": eval_count and int(total_eval_ms / eval_count) or None,
                        "avg_summary_ms": summary_count and int(total_summary_ms / summary_count) or None,
                        "avg_embed_ms": embed_count and int(total_embed_ms / embed_count) or None,
                    },
                )
            finally:
                await r.close()
        except Exception:
            pass

    log.info("ingest_batch_complete", accepted=accepted, rejected=rejected, errored=errored)
    return {
        "processed": accepted + rejected + errored,
        "accepted": accepted,
        "rejected": rejected,
        "errored": errored,
    }
