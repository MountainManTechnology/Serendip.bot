"""Shared telemetry helpers for the Python agent.

All telemetry operations are fire-and-forget: they never block the caller and
never propagate exceptions. A telemetry failure must not affect the main
pipeline.

Usage::

    from agent.telemetry import push_event, get_worker_id

    async def my_task():
        await push_event(redis_client, {
            "type": "agent_task",
            "ts": datetime.now(UTC).isoformat(),
            "worker_id": get_worker_id(),
            ...
        })
"""

from __future__ import annotations

import asyncio
import json
import socket
from datetime import UTC, datetime
from typing import Any

# Bounded list cap — prevents unbounded Redis memory growth if drain stalls.
# At ~400 bytes/event this is ~40 MB worst case.
_LIST_CAP = 99_999
_METRICS_KEY = "metrics:events"


def get_worker_id() -> str:
    """Return a stable identifier for this worker container.

    Uses the container hostname (set by Docker to the container ID or the
    service name + replica index in Swarm/Compose deploy mode).
    """
    return socket.gethostname()


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


async def push_event(
    redis: Any,
    event: dict[str, Any],
) -> None:
    """Push a telemetry event to the unified Redis list.

    Fire-and-forget: awaits the push but swallows any exception.
    The LTRIM keeps the list bounded.

    Args:
        redis: An open ``redis.asyncio`` client (caller owns lifecycle).
        event: A dict with at minimum a ``"type"`` key
               (``'page'`` | ``'agent_task'`` | ``'llm_cost'``).
    """
    try:
        payload = json.dumps(event, default=str)
        pipe = redis.pipeline()
        pipe.lpush(_METRICS_KEY, payload)
        pipe.ltrim(_METRICS_KEY, 0, _LIST_CAP)
        await pipe.execute()
    except Exception:  # noqa: BLE001
        # Telemetry failures are always swallowed
        pass


async def push_event_nowait(
    redis: Any,
    event: dict[str, Any],
) -> None:
    """Schedule a push without awaiting it.

    Wraps ``push_event`` in ``asyncio.create_task`` so the caller gets
    fire-and-forget semantics even in an async context.
    """
    try:
        asyncio.create_task(push_event(redis, event))
    except RuntimeError:
        # No running event loop — best-effort synchronous fallback
        pass
