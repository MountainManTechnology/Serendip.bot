"""Celery telemetry tasks: drain, refresh, rotate, heartbeat.

These tasks are registered in celery_app.py via ``include=["agent.telemetry_tasks"]``
and scheduled in ``beat_schedule``.

Drain task (every 5s):
    - RPOP up to 500 events from ``metrics:events``
    - Route on event["type"] to the correct Postgres table
    - On INSERT failure, re-push to DLQ ``metrics:events:dlq``

Refresh tasks:
    - ``REFRESH MATERIALIZED VIEW`` for the three views that support CONCURRENTLY

Rotate task (daily 01:00 UTC):
    - Creates tomorrow's page_events partition
    - Drops partitions older than 30 days

Heartbeat task (every 15s):
    - SETEX ``metrics:worker:alive:{worker_id}`` 30 {iso_ts}
    - Lets the admin dashboard show live worker count
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg
import redis.asyncio as aioredis
from psycopg.rows import dict_row

from agent.celery_app import app
from agent.config import settings
from agent.logging import log
from agent.telemetry import get_worker_id, now_iso

_DRAIN_BATCH = 500
_DLQ_KEY = "metrics:events:dlq"
_DLQ_CAP = 999
_HEARTBEAT_TTL = 30  # seconds


# ═══════════════════════════════════════════════════════════════════════════
# INSERT helpers
# ═══════════════════════════════════════════════════════════════════════════


async def _insert_page_events(
    conn: psycopg.AsyncConnection[Any],
    rows: list[dict[str, Any]],
) -> None:
    if not rows:
        return
    async with conn.cursor() as cur:
        await cur.executemany(
            """
            INSERT INTO metrics.page_events (
                ts, trace_id, session_id, user_id, source, worker_id,
                path, method, status, response_ms, referrer_host,
                country, device_class, app_version
            ) VALUES (
                %(ts)s, %(trace_id)s, %(session_id)s, %(user_id)s,
                %(source)s, %(worker_id)s,
                %(path)s, %(method)s, %(status)s, %(response_ms)s,
                %(referrer_host)s, %(country)s, %(device_class)s, %(app_version)s
            )
            ON CONFLICT DO NOTHING
            """,
            rows,
        )
    await conn.commit()


async def _insert_agent_task_events(
    conn: psycopg.AsyncConnection[Any],
    rows: list[dict[str, Any]],
) -> None:
    if not rows:
        return
    async with conn.cursor() as cur:
        await cur.executemany(
            """
            INSERT INTO metrics.agent_task_events (
                ts, trace_id, worker_id, task_name, queue,
                status, duration_ms, retries, error_type
            ) VALUES (
                %(ts)s, %(trace_id)s, %(worker_id)s, %(task_name)s, %(queue)s,
                %(status)s, %(duration_ms)s, %(retries)s, %(error_type)s
            )
            """,
            rows,
        )
    await conn.commit()


async def _insert_llm_cost_events(
    conn: psycopg.AsyncConnection[Any],
    rows: list[dict[str, Any]],
) -> None:
    if not rows:
        return
    async with conn.cursor() as cur:
        await cur.executemany(
            """
            INSERT INTO metrics.llm_cost_events (
                ts, trace_id, worker_id, user_id, task_type, call_type,
                model, provider, prompt_tokens, completion_tokens, estimated_cost_usd
            ) VALUES (
                %(ts)s, %(trace_id)s, %(worker_id)s, %(user_id)s,
                %(task_type)s, %(call_type)s,
                %(model)s, %(provider)s, %(prompt_tokens)s,
                %(completion_tokens)s, %(estimated_cost_usd)s
            )
            """,
            rows,
        )
    await conn.commit()


# ═══════════════════════════════════════════════════════════════════════════
# Drain task
# ═══════════════════════════════════════════════════════════════════════════


async def _drain() -> dict[str, int]:
    r = aioredis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]
    conn = await psycopg.AsyncConnection.connect(settings.database_url, row_factory=dict_row)

    page_rows: list[dict[str, Any]] = []
    agent_rows: list[dict[str, Any]] = []
    llm_rows: list[dict[str, Any]] = []
    malformed = 0

    try:
        # RPOP batch — atomic per-pop, naturally safe with singleton beat
        raw_events: list[str] = []
        for _ in range(_DRAIN_BATCH):
            item = await r.rpop("metrics:events")
            if item is None:
                break
            raw_events.append(item)

        for raw in raw_events:
            try:
                event = json.loads(raw)
                event_type = event.get("type")
                # Normalise missing optional fields with None defaults
                event.setdefault("trace_id", None)
                event.setdefault("user_id", None)

                if event_type == "page":
                    event.setdefault("source", "api")
                    event.setdefault("worker_id", None)
                    event.setdefault("referrer_host", None)
                    event.setdefault("country", None)
                    event.setdefault("device_class", None)
                    event.setdefault("app_version", None)
                    page_rows.append(event)
                elif event_type == "agent_task":
                    event.setdefault("queue", None)
                    event.setdefault("duration_ms", None)
                    event.setdefault("retries", 0)
                    event.setdefault("error_type", None)
                    agent_rows.append(event)
                elif event_type == "llm_cost":
                    event.setdefault("completion_tokens", None)
                    event.setdefault("estimated_cost_usd", 0)
                    llm_rows.append(event)
                else:
                    malformed += 1
            except (json.JSONDecodeError, KeyError):
                malformed += 1

        # Bulk inserts — on failure, push batch to DLQ rather than losing events
        try:
            await _insert_page_events(conn, page_rows)
        except Exception as exc:
            log.warning("telemetry_drain_page_insert_failed", error=str(exc))
            await _push_to_dlq(r, [json.dumps(e) for e in page_rows])
            page_rows = []

        try:
            await _insert_agent_task_events(conn, agent_rows)
        except Exception as exc:
            log.warning("telemetry_drain_agent_insert_failed", error=str(exc))
            await _push_to_dlq(r, [json.dumps(e) for e in agent_rows])
            agent_rows = []

        try:
            await _insert_llm_cost_events(conn, llm_rows)
        except Exception as exc:
            log.warning("telemetry_drain_llm_insert_failed", error=str(exc))
            await _push_to_dlq(r, [json.dumps(e) for e in llm_rows])
            llm_rows = []

    finally:
        await conn.close()
        await r.close()

    return {
        "page": len(page_rows),
        "agent_task": len(agent_rows),
        "llm_cost": len(llm_rows),
        "malformed": malformed,
    }


async def _push_to_dlq(r: aioredis.Redis, items: list[str]) -> None:
    if not items:
        return
    try:
        pipe = r.pipeline()
        for item in items:
            pipe.lpush(_DLQ_KEY, item)
        pipe.ltrim(_DLQ_KEY, 0, _DLQ_CAP)
        await pipe.execute()
    except Exception:  # noqa: BLE001
        pass


@app.task(
    name="agent.telemetry_tasks.drain_telemetry_queue",
    bind=False,
    acks_late=False,
    ignore_result=True,
    time_limit=30,
    soft_time_limit=25,
)
def drain_telemetry_queue() -> None:
    """Drain up to 500 events from metrics:events into Postgres."""
    start = datetime.now(UTC)
    try:
        counts = asyncio.run(_drain())
        elapsed = (datetime.now(UTC) - start).total_seconds() * 1000
        log.info(
            "telemetry_drain_done",
            **counts,
            elapsed_ms=round(elapsed, 1),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("telemetry_drain_error", error=str(exc))


# ═══════════════════════════════════════════════════════════════════════════
# Materialized view refresh tasks
# ═══════════════════════════════════════════════════════════════════════════


async def _refresh_view(view: str, concurrently: bool = True) -> None:
    conn = await psycopg.AsyncConnection.connect(
        settings.database_url,
        autocommit=True,
        row_factory=dict_row,
    )
    try:
        concurrent_clause = "CONCURRENTLY" if concurrently else ""
        async with conn.cursor() as cur:
            await cur.execute(f"REFRESH MATERIALIZED VIEW {concurrent_clause} {view}")
    finally:
        await conn.close()


@app.task(
    name="agent.telemetry_tasks.refresh_current_concurrent",
    ignore_result=True,
    time_limit=30,
)
def refresh_current_concurrent() -> None:
    # current_concurrent has no unique index so cannot use CONCURRENTLY
    try:
        asyncio.run(_refresh_view("metrics.current_concurrent", concurrently=False))
    except Exception as exc:  # noqa: BLE001
        log.warning("telemetry_refresh_concurrent_error", error=str(exc))


@app.task(
    name="agent.telemetry_tasks.refresh_daily_summary",
    ignore_result=True,
    time_limit=60,
)
def refresh_daily_summary() -> None:
    try:
        asyncio.run(_refresh_view("metrics.daily_summary", concurrently=True))
    except Exception as exc:  # noqa: BLE001
        log.warning("telemetry_refresh_daily_error", error=str(exc))


@app.task(
    name="agent.telemetry_tasks.refresh_llm_cost_view",
    ignore_result=True,
    time_limit=60,
)
def refresh_llm_cost_view() -> None:
    try:
        asyncio.run(_refresh_view("metrics.daily_llm_cost", concurrently=True))
    except Exception as exc:  # noqa: BLE001
        log.warning("telemetry_refresh_llm_cost_error", error=str(exc))


# ═══════════════════════════════════════════════════════════════════════════
# Partition rotation task
# ═══════════════════════════════════════════════════════════════════════════


async def _rotate_partitions() -> dict[str, Any]:
    conn = await psycopg.AsyncConnection.connect(
        settings.database_url,
        autocommit=True,
        row_factory=dict_row,
    )
    created = []
    dropped = []
    try:
        async with conn.cursor() as cur:
            # Create tomorrow's partition if it doesn't exist
            tomorrow = datetime.now(UTC).date() + timedelta(days=1)
            day_after = tomorrow + timedelta(days=1)
            tbl = f"page_events_{tomorrow.strftime('%Y_%m_%d')}"
            await cur.execute(
                """
                SELECT 1 FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'metrics' AND c.relname = %s
                """,
                (tbl,),
            )
            if not await cur.fetchone():
                await cur.execute(
                    f"""
                    CREATE TABLE metrics.{tbl}
                    PARTITION OF metrics.page_events
                    FOR VALUES FROM ('{tomorrow}') TO ('{day_after}')
                    """
                )
                created.append(tbl)

            # Drop partitions older than 30 days
            cutoff = datetime.now(UTC).date() - timedelta(days=30)
            await cur.execute(
                """
                SELECT c.relname
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'metrics'
                  AND c.relname LIKE 'page_events_%'
                  AND c.relispartition = true
                """,
            )
            all_partitions = [row["relname"] for row in await cur.fetchall()]
            for part in all_partitions:
                # Parse date from name: page_events_YYYY_MM_DD
                try:
                    suffix = part.replace("page_events_", "")
                    part_date = datetime.strptime(suffix, "%Y_%m_%d").date()
                    if part_date < cutoff:
                        await cur.execute(f"DROP TABLE metrics.{part}")
                        dropped.append(part)
                except ValueError:
                    continue
    finally:
        await conn.close()
    return {"created": created, "dropped": dropped}


@app.task(
    name="agent.telemetry_tasks.rotate_partitions",
    ignore_result=True,
    time_limit=120,
)
def rotate_partitions() -> None:
    try:
        result = asyncio.run(_rotate_partitions())
        log.info("telemetry_partitions_rotated", **result)
    except Exception as exc:  # noqa: BLE001
        log.warning("telemetry_rotate_error", error=str(exc))


# ═══════════════════════════════════════════════════════════════════════════
# Worker heartbeat task
# ═══════════════════════════════════════════════════════════════════════════


async def _heartbeat() -> None:
    worker_id = get_worker_id()
    r = aioredis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]
    try:
        await r.setex(f"metrics:worker:alive:{worker_id}", _HEARTBEAT_TTL, now_iso())
    finally:
        await r.close()


@app.task(
    name="agent.telemetry_tasks.worker_heartbeat",
    ignore_result=True,
    time_limit=10,
)
def worker_heartbeat() -> None:
    try:
        asyncio.run(_heartbeat())
    except Exception:  # noqa: BLE001
        pass
