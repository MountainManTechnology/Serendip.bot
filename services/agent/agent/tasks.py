"""Celery tasks wrapping the existing DiscoveryAgent orchestration.

The `discover` task is the main entrypoint — it runs the full DiscoveryAgent
pipeline as a single task. Status updates are written to the same Redis keys
(`discovery:job:{job_id}`) that the Node API polls, preserving backward
compatibility.

Future enhancement: decompose into chord(group(crawl_and_classify), rank_and_store)
for per-URL fan-out across workers.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import Coroutine
from datetime import UTC, datetime
from typing import Any, TypeVar

from celery.exceptions import SoftTimeLimitExceeded

from agent.celery_app import app
from agent.config import settings
from agent.logging import log

RESULT_TTL = 600  # 10 minutes — matches the existing worker.py contract

_T = TypeVar("_T")


def _run_async(coro: Coroutine[Any, Any, _T]) -> _T:
    """Run an async coroutine from a gevent worker using a real OS thread.

    gevent monkey-patches ``threading.Thread`` into a greenlet, so both plain
    ``threading.Thread`` and ``concurrent.futures.ThreadPoolExecutor`` share the
    gevent event loop.  ``asyncio.run()`` detects that loop and raises
    ``RuntimeError('asyncio.run() cannot be called from a running event loop')``.

    ``gevent.get_hub().threadpool`` is backed by libev/libuv real OS threads that
    are invisible to gevent's event-loop detector, giving asyncio a clean,
    loop-free execution context.  ``AsyncResult.get()`` blocks the calling
    greenlet cooperatively (yields to the hub) until the OS thread finishes.
    """
    import gevent

    return gevent.get_hub().threadpool.spawn(asyncio.run, coro).get()  # type: ignore[return-value, no-any-return]


class _JsonEncoder(json.JSONEncoder):
    def default(self, obj: Any) -> Any:
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


# ═══════════════════════════════════════════════════════════════════════════
# Async Redis helpers (short-lived connections — Celery owns process lifecycle)
# ═══════════════════════════════════════════════════════════════════════════
async def _set_status(job_id: str, status: str, **extra: Any) -> None:
    import redis.asyncio as aioredis

    r = aioredis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]
    try:
        data = {"jobId": str(job_id), "status": status, "sites": [], **extra}
        await r.setex(f"discovery:job:{job_id}", RESULT_TTL, json.dumps(data, cls=_JsonEncoder))  # type: ignore[misc]
    finally:
        await r.close()


async def _publish_completion(job_id: str, sites: list[dict[str, Any]]) -> None:
    import redis.asyncio as aioredis

    r = aioredis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]
    try:
        await r.publish(  # type: ignore[misc]
            f"job:done:{job_id}",
            json.dumps({"job_id": job_id, "count": len(sites)}, cls=_JsonEncoder),
        )
    finally:
        await r.close()


# ═══════════════════════════════════════════════════════════════════════════
# Main discovery task
# ═══════════════════════════════════════════════════════════════════════════
@app.task(
    name="agent.tasks.discover",
    bind=True,
    acks_late=True,
    autoretry_for=(ConnectionError,),
    retry_backoff=True,
    retry_backoff_max=30,
    max_retries=3,
)
def discover(
    self: Any, session_id: str, mood: str, topics: list[str] | None = None
) -> dict[str, Any]:
    """Run the full discovery pipeline for a session.

    Wraps DiscoveryAgent.run() — the same orchestration as worker.py but
    managed by Celery instead of BullMQ.
    """
    job_id = self.request.id
    try:
        return _run_async(_discover(job_id, session_id, mood, topics or []))
    except SoftTimeLimitExceeded:
        log.error("task_soft_timeout", job_id=job_id, session_id=session_id)
        _run_async(_set_status(job_id, "failed", error="timeout"))
        return {"job_id": job_id, "status": "failed", "error": "timeout"}


async def _discover(job_id: str, session_id: str, mood: str, topics: list[str]) -> dict[str, Any]:
    import redis.asyncio as aioredis

    from agent.discovery_agent import DiscoveryAgent

    await _set_status(job_id, "processing")
    log.info("task_started", job_id=job_id, session_id=session_id, mood=mood)

    redis = aioredis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]
    try:
        agent = DiscoveryAgent(redis=redis)
        payload = {"sessionId": session_id, "mood": mood, "topics": topics}

        # Callback fires immediately after reranking — before blurb LLM calls and
        # DB persistence — so the user is unblocked within ~500 ms of task start.
        # Descriptions are used as why_blurb fallback; no re-poll required.
        early_complete_fired = False

        async def _on_ready(fast_sites: list[dict[str, Any]]) -> None:
            nonlocal early_complete_fired
            completed_at = datetime.now(UTC).isoformat()
            await _set_status(job_id, "complete", sites=fast_sites, completedAt=completed_at)
            await _publish_completion(job_id, fast_sites)
            early_complete_fired = True
            log.info("task_early_complete", job_id=job_id, result_count=len(fast_sites))

        result = await agent.run(payload, on_candidates_ready=_on_ready)

        # Ensure status is written even if the callback was never fired (edge cases:
        # empty result, exception inside callback, etc.)
        if not early_complete_fired:
            completed_at = datetime.now(UTC).isoformat()
            await _set_status(job_id, "complete", sites=result, completedAt=completed_at)
            await _publish_completion(job_id, result)

        log.info("task_complete", job_id=job_id, result_count=len(result))
        return {"job_id": job_id, "status": "complete", "count": len(result)}

    except Exception as exc:
        log.error("task_failed", job_id=job_id, error=str(exc))
        await _set_status(job_id, "failed", error=str(exc))
        raise
    finally:
        await redis.close()


# ═══════════════════════════════════════════════════════════════════════════
# Scheduled tasks
# ═══════════════════════════════════════════════════════════════════════════
@app.task(name="agent.tasks.refresh_seeds", acks_late=True)
def refresh_seeds() -> dict[str, str]:
    """Hourly: refresh seed URLs from YAML files + RSS feeds."""
    from agent.seeds import refresh

    _run_async(refresh())
    return {"status": "ok"}


@app.task(name="agent.tasks.hourly_discovery", acks_late=True)
def hourly_discovery_task() -> dict[str, Any]:
    """Hourly: auto-discover and register feeds to bootstrap rss_feeds table.

    Targets 50+ feeds per category. Uses Grok for bulk scoring,
    GPT-5.1 for edge-case review (0.60-0.65). Auto-inserts >= 0.65.
    """
    from agent.hourly_discovery import hourly_discovery

    result = _run_async(hourly_discovery())
    log.info("hourly_discovery_task_complete", total_inserted=result.get("total_inserted"))
    return result


@app.task(name="agent.tasks.purge_stale_cache", acks_late=True)
def purge_stale_cache() -> dict[str, int]:
    """Daily: purge site evaluations older than 30 days from Redis."""

    async def _purge() -> int:
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]
        try:
            # Redis TTLs handle expiry for site:eval:* keys (7-day TTL set on write).
            # This task is a safety net for any keys that slipped through.
            cursor = 0
            purged = 0
            while True:
                cursor, keys = await r.scan(cursor, match="site:eval:*", count=500)  # type: ignore[misc]
                for key in keys:
                    ttl = await r.ttl(key)  # type: ignore[misc]
                    if ttl == -1:  # No expiry set — add one
                        await r.expire(key, 7 * 86400)  # type: ignore[misc]
                        purged += 1
                if cursor == 0:
                    break
            return purged
        finally:
            await r.close()

    purged = _run_async(_purge())
    log.info("cache_purged", keys_fixed=purged)
    return {"keys_fixed": purged}


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 1 scaffolding tasks
# ═══════════════════════════════════════════════════════════════════════════════


@app.task(name="agent.tasks.backfill_mood_affinities", acks_late=True)
def backfill_mood_affinities() -> dict[str, int]:
    """One-shot: compute cosine similarity between site_cache embeddings and mood embeddings.

    Safe to run multiple times — processes only rows where mood_affinities is empty.
    Run after mood_seeder.py has populated the moods table.
    """

    async def _run() -> int:
        from agent.db import backfill_mood_affinities_batch, get_connection

        conn = await get_connection()
        updated = 0
        async with conn:
            while True:
                n = await backfill_mood_affinities_batch(conn, batch_size=100)
                updated += n
                if n < 100:
                    break
        return updated

    count = _run_async(_run())
    log.info("backfill_mood_affinities_complete", updated=count)
    return {"updated": count}


@app.task(name="agent.tasks.seed_moods", acks_late=True)
def seed_moods_task() -> dict[str, int]:
    """Trigger mood seeding via Celery (idempotent — safe to re-run)."""

    async def _run() -> int:
        from agent.db import get_connection
        from agent.mood_seeder import seed_moods

        conn = await get_connection()
        async with conn:
            return await seed_moods(conn)

    count = _run_async(_run())
    log.info("seed_moods_complete", count=count)
    return {"count": count}


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 2 ingestion tasks
# ═══════════════════════════════════════════════════════════════════════════════


@app.task(
    name="agent.tasks.ingest_batch",
    bind=False,
    acks_late=True,
    autoretry_for=(ConnectionError,),
    retry_backoff=True,
    max_retries=3,
)
def ingest_batch(batch_size: int = 5) -> dict[str, int]:
    """Every 5 min: drain pending ingest_attempts and evaluate URLs into site_cache."""
    from agent.ingestion import run_ingest_batch

    start = time.perf_counter()
    result = _run_async(run_ingest_batch(batch_size))
    duration_ms = int((time.perf_counter() - start) * 1000)

    log.info("ingest_batch_done", **result)

    # Fire-and-forget: push a duration-bearing agent_task event so telemetry
    # tables have per-batch timings (best-effort, swallow errors).
    try:
        import redis.asyncio as _aioredis

        from agent.config import settings as _settings
        from agent.telemetry import get_worker_id, now_iso, push_event

        async def _push() -> None:
            r = _aioredis.from_url(_settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]
            try:
                await push_event(
                    r,
                    {
                        "type": "agent_task",
                        "ts": now_iso(),
                        "trace_id": None,
                        "worker_id": get_worker_id(),
                        "task_name": "agent.tasks.ingest_batch",
                        "queue": "discovery",
                        "status": "success",
                        "duration_ms": duration_ms,
                        "retries": 0,
                        "error_type": None,
                    },
                )
            finally:
                await r.close()

        try:
            _run_async(_push())
        except Exception:
            pass
    except Exception:
        pass

    # Trigger blurb pre-warming for newly accepted content (best-effort, fire-and-forget)
    if result.get("accepted", 0) > 0:
        try:
            app.send_task("agent.tasks.prewarm_blurbs", queue="finalize")
        except Exception as exc:
            log.warning("prewarm_blurbs_enqueue_failed", error=str(exc))

    return result


@app.task(name="agent.tasks.rescore_stale", acks_late=True)
def rescore_stale(batch_size: int = 20) -> dict[str, int]:
    """Daily: re-crawl and re-evaluate site_cache rows past their rescore_at date."""

    async def _run() -> dict[str, int]:
        from psycopg.types.json import Jsonb

        from agent.db import get_connection
        from agent.ingestion import evaluate_url, quality_gate

        conn = await get_connection()
        rescored = failed = 0
        async with conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, url, url_hash FROM site_cache
                    WHERE rescore_at < NOW() AND status = 'ready'
                    LIMIT %(batch_size)s
                    """,
                    {"batch_size": batch_size},
                )
                rows = await cur.fetchall()

            for row in rows:
                site_id = row["id"]
                url = row["url"]
                site = await evaluate_url(url)
                if site is None:
                    failed += 1
                    continue

                passed, _ = quality_gate(site)
                new_status = "ready" if passed else "stale"
                async with conn.cursor() as cur2:
                    await cur2.execute(
                        """
                        UPDATE site_cache
                        SET quality_score = %(quality_score)s,
                            categories    = %(categories)s::jsonb,
                            status        = %(status)s,
                            rescore_at    = NOW() + interval '90 days',
                            evaluated_at  = NOW()
                        WHERE id = %(id)s::uuid
                        """,
                        {
                            "quality_score": site["quality_score"],
                            "categories": Jsonb(site["categories"]),
                            "status": new_status,
                            "id": str(site_id),
                        },
                    )
                await conn.commit()
                rescored += 1

        return {"rescored": rescored, "failed": failed}

    result = _run_async(_run())
    log.info("rescore_stale_done", **result)
    return result


@app.task(name="agent.tasks.decay_popularity", acks_late=True)
def decay_popularity() -> dict[str, int]:
    """Daily: decrement all site_cache popularity scores by 1 (floor 0)."""

    async def _run() -> int:
        from agent.db import get_connection

        conn = await get_connection()
        async with conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "UPDATE site_cache SET popularity = GREATEST(0, popularity - 1)"
                    " WHERE popularity > 0"
                )
                count = int(cur.rowcount)
            await conn.commit()
        return count

    count = _run_async(_run())
    log.info("decay_popularity_done", updated=count)
    return {"updated": count}


@app.task(
    name="agent.tasks.prewarm_blurbs",
    bind=False,
    acks_late=True,
    autoretry_for=(ConnectionError,),
    retry_backoff=True,
    max_retries=2,
)
def prewarm_blurbs(site_ids: list[str] | None = None, batch_size: int = 50) -> dict[str, int]:
    """Fill blurb_cache for (site, mood) pairs that are missing blurbs.

    When triggered after ingest_batch (site_ids=None), finds the highest-quality
    unwarmed pairs and generates blurbs for them up to batch_size.
    Runs on the finalize queue to avoid blocking discovery.
    """
    return _run_async(_prewarm_blurbs(site_ids, batch_size))


async def _prewarm_blurbs(site_ids: list[str] | None, batch_size: int) -> dict[str, int]:
    from agent.db import get_connection, get_unwarmed_site_mood_pairs, set_blurbs_in_cache
    from agent.providers.router import router as llm_router
    from agent.serving import _generate_single_blurb

    conn = await get_connection()
    generated = 0
    failed = 0

    async with conn:
        pairs = await get_unwarmed_site_mood_pairs(
            conn,
            site_ids=site_ids,
            min_quality=0.65,
            limit=batch_size,
        )

        if not pairs:
            log.info("prewarm_blurbs_nothing_to_do")
            return {"generated": 0, "failed": 0}

        log.info("prewarm_blurbs_start", count=len(pairs))

        sem = asyncio.Semaphore(5)  # max 5 concurrent LLM calls

        async def _guarded(
            site_dict: dict[str, Any], mood_id: str
        ) -> tuple[str, str, str, str] | None:
            async with sem:
                try:
                    blurb, model = await asyncio.wait_for(
                        _generate_single_blurb(site_dict, mood_id, llm_router),
                        timeout=8.0,
                    )
                    return (site_dict["id"], mood_id, blurb, model)
                except Exception as exc:
                    log.warning("prewarm_blurb_failed", url=site_dict.get("url"), error=str(exc))
                    return None

        tasks = [asyncio.create_task(_guarded(row, row["mood_id"])) for row in pairs]
        results = await asyncio.gather(*tasks)

        new_entries: list[dict[str, Any]] = []
        for result in results:
            if result is None:
                failed += 1
            else:
                site_id, mood_id, blurb, model = result
                new_entries.append(
                    {"site_cache_id": site_id, "mood_id": mood_id, "blurb": blurb, "model": model}
                )
                generated += 1

        if new_entries:
            try:
                await set_blurbs_in_cache(conn, new_entries)
            except Exception as exc:
                log.warning("prewarm_cache_write_failed", error=str(exc))

    log.info("prewarm_blurbs_done", generated=generated, failed=failed)
    return {"generated": generated, "failed": failed}


@app.task(name="agent.tasks.retune_moods", acks_late=True)
def retune_moods() -> None:
    """Weekly: re-embed mood seed prompts and backfill all mood_affinities.

    Ensures mood embeddings stay current if the embedding model changes.
    Also triggers a full backfill so all site_cache rows get updated affinities.
    """
    from agent import mood_seeder
    from agent.db import backfill_mood_affinities_batch, get_connection

    log.info("retune_moods_start")

    async def _run() -> None:
        conn = await get_connection()
        async with conn:
            seeded = await mood_seeder.seed_moods(conn)
            log.info("retune_moods_seeded", count=seeded)

            total = 0
            while True:
                updated = await backfill_mood_affinities_batch(conn, batch_size=200)
                total += updated
                if updated == 0:
                    break

        log.info("retune_moods_complete", total_affinities_updated=total)

    _run_async(_run())
