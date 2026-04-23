"""Celery application entry point for the Serendip Bot discovery pipeline.

Topology
--------
- Broker:          Redis DB 1
- Result backend:  Redis DB 2
- Workers:         prefork pool, concurrency matched to CPU count per container
- Queues:          discovery (fan-out), finalize (chord bodies)
- Beat:            hourly seed refresh + daily cache purge

Running locally
---------------
    celery -A agent.celery_app worker -Q discovery,finalize --loglevel=info --concurrency=4
    celery -A agent.celery_app beat --loglevel=info
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

import gevent
from celery import Celery
from celery.signals import task_failure, worker_ready
from kombu import Exchange, Queue

from agent.config import settings


def _run_async(coro: Any) -> Any:
    """Run a coroutine in a real OS thread so gevent's hub loop doesn't block it."""
    def _run() -> Any:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()
            asyncio.set_event_loop(None)

    return gevent.get_hub().threadpool.apply(_run)

BROKER_URL = os.getenv("CELERY_BROKER_URL") or (
    settings.celery_broker_url or f"{settings.redis_url}/1"
)
RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND") or (
    settings.celery_result_backend or f"{settings.redis_url}/2"
)

app = Celery(
    "serendip",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=["agent.tasks", "agent.telemetry_tasks"],
)

# ── Queue topology ─────────────────────────────────────────────────────────
default_exchange = Exchange("serendip", type="direct", durable=True)

app.conf.task_queues = (
    Queue("discovery", default_exchange, routing_key="discovery", durable=True),
    Queue("finalize", default_exchange, routing_key="finalize", durable=True),
)

app.conf.task_default_queue = "discovery"
app.conf.task_default_exchange = "serendip"
app.conf.task_default_routing_key = "discovery"

# ── Routing ────────────────────────────────────────────────────────────────
app.conf.task_routes = {
    "agent.tasks.discover": {"queue": "discovery"},
    "agent.tasks.refresh_seeds": {"queue": "discovery"},
    "agent.tasks.purge_stale_cache": {"queue": "finalize"},
    # Phase 2 ingestion tasks
    "agent.tasks.ingest_batch": {"queue": "discovery"},
    "agent.tasks.rescore_stale": {"queue": "discovery"},
    "agent.tasks.decay_popularity": {"queue": "finalize"},
    # Phase 1 scaffolding tasks
    "agent.tasks.backfill_mood_affinities": {"queue": "finalize"},
    "agent.tasks.seed_moods": {"queue": "finalize"},
    # Blurb pre-warming
    "agent.tasks.prewarm_blurbs": {"queue": "finalize"},
    # Telemetry tasks (finalize queue — low priority, brief tasks)
    "agent.telemetry_tasks.drain_telemetry_queue": {"queue": "finalize"},
    "agent.telemetry_tasks.refresh_current_concurrent": {"queue": "finalize"},
    "agent.telemetry_tasks.refresh_daily_summary": {"queue": "finalize"},
    "agent.telemetry_tasks.refresh_llm_cost_view": {"queue": "finalize"},
    "agent.telemetry_tasks.rotate_partitions": {"queue": "finalize"},
    "agent.telemetry_tasks.worker_heartbeat": {"queue": "finalize"},
}
# Route for image follow-up processing
app.conf.task_routes.update({
    "agent.tasks.process_image_site": {"queue": "finalize"},
})

# ── Retry / ack policy ─────────────────────────────────────────────────────
app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,
    task_time_limit=240,
    task_soft_time_limit=200,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=200,
    result_expires=3600,
    broker_connection_retry_on_startup=True,
    broker_transport_options={"visibility_timeout": 3600},
)

# ── Scheduled tasks (Celery Beat) ──────────────────────────────────────────
# Beat offset notes to avoid thundering herd on minute boundaries:
#   drain     :00/:05 (every 5s — fine-grained, natural spread)
#   heartbeat :02/:17/:32/:47 (every 15s)
#   concurrent :07 past each minute
#   daily_summary :02 past each 5-min mark
#   llm_cost  :00 past each 15-min mark
#   rotate    01:00 UTC daily
app.conf.beat_schedule = {
    "refresh-seed-urls-hourly": {
        "task": "agent.tasks.refresh_seeds",
        "schedule": 3600.0,
    },
    "purge-stale-cache-daily": {
        "task": "agent.tasks.purge_stale_cache",
        "schedule": 86400.0,
    },
    "ingest-batch-every-5min": {
        "task": "agent.tasks.ingest_batch",
        "schedule": 300.0,
    },
    "rescore-stale-sites-daily": {
        "task": "agent.tasks.rescore_stale",
        "schedule": 86400.0,
    },
    "decay-popularity-daily": {
        "task": "agent.tasks.decay_popularity",
        "schedule": 86400.0,
    },
    "retune-moods-weekly": {
        "task": "agent.tasks.retune_moods",
        "schedule": 604800,
    },
    "prewarm-blurbs-every-30min": {
        "task": "agent.tasks.prewarm_blurbs",
        "schedule": 1800.0,
    },
    # ── Telemetry tasks ──────────────────────────────────────────────────
    "telemetry-drain-every-5s": {
        "task": "agent.telemetry_tasks.drain_telemetry_queue",
        "schedule": 5.0,
    },
    "telemetry-refresh-concurrent-60s": {
        "task": "agent.telemetry_tasks.refresh_current_concurrent",
        "schedule": 60.0,
    },
    "telemetry-refresh-daily-summary-5min": {
        "task": "agent.telemetry_tasks.refresh_daily_summary",
        "schedule": 300.0,
    },
    "telemetry-refresh-llm-cost-15min": {
        "task": "agent.telemetry_tasks.refresh_llm_cost_view",
        "schedule": 900.0,
    },
    "telemetry-rotate-partitions-daily": {
        "task": "agent.telemetry_tasks.rotate_partitions",
        "schedule": 86400.0,
    },
    "telemetry-worker-heartbeat-15s": {
        "task": "agent.telemetry_tasks.worker_heartbeat",
        "schedule": 15.0,
    },
}


# ── Celery signals ──────────────────────────────────────────────────────────
from celery.signals import celeryd_after_setup, task_postrun, task_prerun  # noqa: E402


@worker_ready.connect
def _announce_ready(sender: Any = None, **_: Any) -> None:
    region = os.getenv("APP_REGION", "local")
    print(f"[celery] worker ready host={sender.hostname} region={region}")
    # Kick off an immediate seed refresh so a fresh deployment doesn't sit
    # idle for up to one hour waiting for the first Beat tick.
    try:
        app.send_task("agent.tasks.refresh_seeds", queue="discovery")
        print("[celery] queued startup refresh_seeds")
    except Exception as exc:  # noqa: BLE001
        print(f"[celery] startup refresh_seeds failed to queue: {exc}")


@task_failure.connect
def _log_failure(sender: Any = None, task_id: Any = None, exception: Any = None, **_: Any) -> None:
    name = sender.name if sender else "?"
    print(f"[celery] task FAILED task={name} id={task_id} err={exception!r}")


@celeryd_after_setup.connect
def _initial_heartbeat(sender: Any = None, **_: Any) -> None:
    """Push initial heartbeat on worker startup."""
    import redis.asyncio as _aioredis

    from agent.telemetry import get_worker_id, now_iso

    worker_id = get_worker_id()

    async def _hb() -> None:
        r = _aioredis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]
        try:
            await r.setex(f"metrics:worker:alive:{worker_id}", 30, now_iso())
        finally:
            await r.close()

    try:
        _run_async(_hb())
    except Exception:
        pass


@task_prerun.connect
def _task_prerun_handler(
    sender: Any = None,
    task_id: Any = None,
    task: Any = None,
    args: Any = None,
    kwargs: Any = None,
    **_: Any,
) -> None:
    """Push agent_task 'started' event to metrics:events."""
    import redis.asyncio as _aioredis

    from agent.telemetry import get_worker_id, now_iso, push_event

    # Don't instrument the telemetry tasks themselves (recursion-safe)
    task_name = getattr(task, "name", "") or ""
    if "telemetry_tasks" in task_name:
        return

    async def _push() -> None:
        r = _aioredis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]
        try:
            await push_event(
                r,
                {
                    "type": "agent_task",
                    "ts": now_iso(),
                    "trace_id": (kwargs or {}).get("trace_id"),
                    "worker_id": get_worker_id(),
                    "task_name": task_name,
                    "queue": getattr(task, "queue", None),
                    "status": "started",
                    "duration_ms": None,
                    "retries": getattr(task, "request", None) and task.request.retries or 0,
                    "error_type": None,
                },
            )
        finally:
            await r.close()

    try:
        _run_async(_push())
    except Exception:
        pass


@task_postrun.connect
def _task_postrun_handler(
    sender: Any = None,
    task_id: Any = None,
    task: Any = None,
    args: Any = None,
    kwargs: Any = None,
    retval: Any = None,
    state: Any = None,
    **_: Any,
) -> None:
    """Push agent_task 'success' event to metrics:events."""
    import redis.asyncio as _aioredis

    from agent.telemetry import get_worker_id, now_iso, push_event

    task_name = getattr(task, "name", "") or ""
    if "telemetry_tasks" in task_name:
        return

    async def _push() -> None:
        r = _aioredis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]
        try:
            await push_event(
                r,
                {
                    "type": "agent_task",
                    "ts": now_iso(),
                    "trace_id": (kwargs or {}).get("trace_id"),
                    "worker_id": get_worker_id(),
                    "task_name": task_name,
                    "queue": getattr(task, "queue", None),
                    "status": "success",
                    "duration_ms": None,  # runtime not directly available in postrun
                    "retries": getattr(task, "request", None) and task.request.retries or 0,
                    "error_type": None,
                },
            )
        finally:
            await r.close()

    try:
        _run_async(_push())
    except Exception:
        pass


if __name__ == "__main__":
    app.start()
