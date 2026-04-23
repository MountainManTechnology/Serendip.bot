"""BullMQ worker — consumes discovery jobs from Redis queue.

Uses the official bullmq Python Worker class so that retries, backoff,
stalled-job detection, and completion events all work correctly through
BullMQ's Lua scripts.
"""

from __future__ import annotations

import asyncio
import json
import signal
from datetime import UTC, datetime
from typing import Any

from bullmq import Worker
from redis.asyncio import Redis

from agent.config import settings
from agent.logging import log

QUEUE_NAME = "discovery"
JOB_TIMEOUT = 120  # seconds
RESULT_TTL = 600  # 10 minutes


async def processor(job: Any, token: str) -> list[dict[str, Any]]:
    """Process a single discovery job.

    Called by the bullmq Worker for each job.  The return value is stored
    as the job's ``returnvalue`` by BullMQ.  If we raise, BullMQ handles
    retry / failure lifecycle automatically.
    """
    job_id = job.id
    payload = job.data
    redis = Redis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]
    result_key = f"discovery:job:{job_id}"

    async def set_status(status: str, **extra: Any) -> None:
        data = {"jobId": str(job_id), "status": status, "sites": [], **extra}
        await redis.setex(result_key, RESULT_TTL, json.dumps(data))  # type: ignore[misc]

    try:
        await set_status("processing")
        log.info("job_started", job_id=job_id, session_id=payload.get("sessionId"))

        # Import here to avoid loading heavy deps at startup
        from agent.discovery_agent import DiscoveryAgent  # noqa: PLC0415

        agent = DiscoveryAgent(redis=redis)
        result = await asyncio.wait_for(agent.run(payload), timeout=JOB_TIMEOUT)

        completed_at = datetime.now(UTC).isoformat()
        await set_status("complete", sites=result, completedAt=completed_at)
        log.info("job_complete", job_id=job_id, result_count=len(result))

        return result

    except TimeoutError:
        log.error("job_timeout", job_id=job_id)
        await set_status("failed", error="timeout")
        raise
    except Exception as exc:
        log.error("job_failed", job_id=job_id, error=str(exc))
        await set_status("failed", error=str(exc))
        raise
    finally:
        await redis.close()


async def run_worker() -> None:
    log.info("worker_started", queue=QUEUE_NAME)

    worker = Worker(
        QUEUE_NAME,
        processor,
        {
            "autorun": False,
            "connection": settings.redis_url,
            "concurrency": 2,
            "lockDuration": JOB_TIMEOUT * 1000,  # ms — must exceed job timeout
            "stalledInterval": 30_000,  # check for stalled jobs every 30s
            "maxStalledCount": 2,
        },
    )

    # Graceful shutdown on SIGTERM / SIGINT
    loop = asyncio.get_running_loop()

    def _request_shutdown() -> None:
        log.info("shutdown_requested")
        asyncio.ensure_future(worker.close())

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _request_shutdown)

    # worker.run() blocks until worker.close() is called
    log.info("worker_running", queue=QUEUE_NAME, concurrency=2)
    await worker.run()
    log.info("worker_stopped")


if __name__ == "__main__":
    asyncio.run(run_worker())
