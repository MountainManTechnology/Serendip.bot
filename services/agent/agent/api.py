"""FastAPI shim — the ONLY public-facing surface of the agent service.

- Node API calls POST /internal/discover to enqueue a job.
- Node API polls GET /internal/job/{id} for status.
- Workers are background-only; they do NOT serve HTTP.

Auth: shared-secret header (INTERNAL_API_TOKEN). In production, place this
service on a private network so the token is defence-in-depth, not the only gate.

Run locally:
    uvicorn agent.api:app --host 0.0.0.0 --port 8001 --reload
"""

from __future__ import annotations

import hmac
from typing import Any

from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from agent.celery_app import app as celery_app
from agent.config import settings
from agent.tasks import discover
from agent.url_safety import is_safe_url

_INTERNAL_TOKEN = settings.internal_api_token

app = FastAPI(title="Serendip Agent API", version="1.0.0")


class DiscoverRequest(BaseModel):
    session_id: str = Field(..., min_length=8, max_length=64)
    mood: str = Field(
        ..., pattern=r"^(wonder|learn|create|laugh|chill|explore|relax|inspire|challenge)$"
    )
    topics: list[str] = Field(default_factory=list)


class DiscoverResponse(BaseModel):
    job_id: str
    status: str = "queued"


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    result: dict[str, Any] | list[Any] | None = None


# ─── Feed submission ──────────────────────────────────────────────────────────

VALID_CATEGORIES = {
    "culture",
    "design",
    "food",
    "gaming",
    "general",
    "health",
    "history",
    "humor",
    "nature",
    "philosophy",
    "science",
    "technology",
    "travel",
}


class FeedItem(BaseModel):
    url: str = Field(..., max_length=512)
    category_hint: str = Field(default="general", pattern=r"^[a-z]+$")


class FeedSubmitRequest(BaseModel):
    feeds: list[FeedItem] = Field(..., min_length=1, max_length=50)


class FeedSubmitResponse(BaseModel):
    queued: int
    skipped: int
    errors: list[str] = []


def _verify(token: str) -> None:
    if not _INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="INTERNAL_API_TOKEN not configured",
        )
    if not hmac.compare_digest(token, _INTERNAL_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="unauthorized",
        )


@app.post("/internal/discover", response_model=DiscoverResponse)
async def submit_discover(
    req: DiscoverRequest,
    x_internal_token: str = Header(...),
) -> DiscoverResponse:
    _verify(x_internal_token)
    res = discover.apply_async(args=[req.session_id, req.mood, req.topics])
    return DiscoverResponse(job_id=res.id)


@app.get("/internal/job/{job_id}", response_model=JobStatusResponse)
async def get_job(
    job_id: str,
    x_internal_token: str = Header(...),
) -> JobStatusResponse:
    _verify(x_internal_token)
    res = celery_app.AsyncResult(job_id)
    return JobStatusResponse(
        job_id=job_id,
        status=res.status,
        result=res.result if res.ready() else None,
    )


@app.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.get("/readyz")
async def readyz() -> dict[str, str | bool]:
    """Broker connectivity probe."""
    try:
        with celery_app.connection_or_acquire() as conn:
            conn.ensure_connection(max_retries=1)
        return {"ok": True, "broker": "up"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"broker unreachable: {exc!r}")


@app.post("/internal/feeds", response_model=FeedSubmitResponse)
async def submit_feeds(
    req: FeedSubmitRequest,
    x_internal_token: str = Header(...),
) -> FeedSubmitResponse:
    """Register RSS/Atom feed URLs for daily harvesting.

    Each feed is persisted in the rss_feeds table and picked up automatically
    by the next hourly refresh_seeds run.  Duplicate URLs are silently skipped.
    """
    _verify(x_internal_token)

    from agent.db import get_connection, insert_rss_feed

    queued = 0
    skipped = 0
    errors: list[str] = []

    conn = await get_connection()
    async with conn:
        for item in req.feeds:
            url = str(item.url).strip()

            # Scheme check
            if not url.startswith(("http://", "https://")):
                errors.append(f"{url}: scheme must be http or https")
                skipped += 1
                continue

            # SSRF guard
            if not is_safe_url(url):
                errors.append(f"{url}: resolves to a private or reserved address")
                skipped += 1
                continue

            # Category guard — coerce unknown categories to 'general'
            category = item.category_hint if item.category_hint in VALID_CATEGORIES else "general"

            inserted = await insert_rss_feed(conn, url, category)
            if inserted:
                queued += 1
            else:
                skipped += 1

    return FeedSubmitResponse(queued=queued, skipped=skipped, errors=errors)


@app.post("/internal/bootstrap")
async def bootstrap(
    x_internal_token: str = Header(...),
) -> dict[str, str]:
    """Trigger seed_moods + refresh_seeds + backfill_mood_affinities (idempotent).

    Call once after configuring an embedding provider to populate the moods table,
    harvest RSS feeds into site_cache, and compute mood affinity vectors.
    """
    _verify(x_internal_token)
    celery_app.send_task("agent.tasks.seed_moods", queue="finalize")
    celery_app.send_task("agent.tasks.refresh_seeds", queue="discovery")
    celery_app.send_task("agent.tasks.backfill_mood_affinities", queue="finalize")
    return {"status": "queued", "tasks": "seed_moods, refresh_seeds, backfill_mood_affinities"}
