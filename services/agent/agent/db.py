"""Database access layer for the Python agent using psycopg3."""

from __future__ import annotations

import hashlib
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from agent.config import settings


async def get_connection() -> psycopg.AsyncConnection[Any]:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    return await psycopg.AsyncConnection.connect(settings.database_url, row_factory=dict_row)


async def upsert_site_cache(conn: psycopg.AsyncConnection[Any], site: dict[str, Any]) -> str:
    """Insert or update a site in site_cache. Returns the row id."""
    url_hash = hashlib.sha256(site["url"].encode()).hexdigest()

    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO site_cache (
                url, url_hash, title, description, content_summary, content_html,
                extracted_images, quality_score, categories, embedding, evaluated_at
            ) VALUES (
                %(url)s, %(url_hash)s, %(title)s, %(description)s,
                %(content_summary)s, %(content_html)s,
                %(extracted_images)s::jsonb, %(quality_score)s,
                %(categories)s::jsonb,
                CASE WHEN %(embedding)s::text IS NULL
                    THEN NULL ELSE %(embedding)s::vector END,
                NOW()
            )
            ON CONFLICT (url_hash) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                content_summary = EXCLUDED.content_summary,
                content_html = EXCLUDED.content_html,
                extracted_images = EXCLUDED.extracted_images,
                quality_score = EXCLUDED.quality_score,
                categories = EXCLUDED.categories,
                embedding = CASE WHEN EXCLUDED.embedding IS NULL
                    THEN site_cache.embedding ELSE EXCLUDED.embedding END,
                evaluated_at = NOW()
            RETURNING id
            """,
            {
                "url": site["url"],
                "url_hash": url_hash,
                "title": site.get("title", ""),
                "description": site.get("description", ""),
                "content_summary": site.get("content_summary", ""),
                "content_html": site.get("content_html", ""),
                "extracted_images": Jsonb(site.get("extracted_images", [])),
                "quality_score": site.get("quality_score"),
                "categories": Jsonb(site.get("categories", [])),
                "embedding": (
                    str(site["embedding"]).replace(" ", "")
                    if site.get("embedding") is not None
                    else None
                ),
            },
        )
        row = await cur.fetchone()
        await conn.commit()
        return str(row["id"]) if row else ""


async def get_cached_site(
    conn: psycopg.AsyncConnection[Any], url_hash: str
) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM site_cache WHERE url_hash = %s", (url_hash,))
        row = await cur.fetchone()
        return dict(row) if row else None


async def record_discovery_session(
    conn: psycopg.AsyncConnection[Any],
    session_id: str,
    mood: str | None,
    topics: list[str],
    status: str = "complete",
) -> str:
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO discovery_sessions (session_id, mood, topics, status, completed_at)
            VALUES (%s::uuid, %s, %s::jsonb, %s, NOW())
            RETURNING id
            """,
            (
                session_id,
                mood,
                Jsonb(topics),
                status,
            ),
        )
        row = await cur.fetchone()
        await conn.commit()
        return str(row["id"]) if row else ""


async def record_discoveries(
    conn: psycopg.AsyncConnection[Any],
    discovery_session_id: str,
    sites: list[dict[str, Any]],
) -> None:
    async with conn.cursor() as cur:
        for site in sites:
            await cur.execute(
                """
                INSERT INTO discoveries
                    (discovery_session_id, site_cache_id, why_blurb, position)
                VALUES (%s::uuid, %s::uuid, %s, %s)
                """,
                (
                    discovery_session_id,
                    site.get("id"),
                    site.get("why_blurb", ""),
                    site.get("position", 0),
                ),
            )
        await conn.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# Mood helpers
# ═══════════════════════════════════════════════════════════════════════════════


async def get_all_moods(conn: psycopg.AsyncConnection[Any]) -> list[dict[str, Any]]:
    """Return all mood rows (id, embedding, category_priors)."""
    async with conn.cursor() as cur:
        await cur.execute("SELECT id, display_name, embedding, category_priors FROM moods")
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def upsert_mood(conn: psycopg.AsyncConnection[Any], mood: dict[str, Any]) -> None:
    """Insert or update a mood row."""
    from psycopg.types.json import Jsonb

    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO moods
                (id, display_name, seed_prompt, embedding, category_priors, updated_at)
            VALUES (%(id)s, %(display_name)s, %(seed_prompt)s,
                    %(embedding)s::vector, %(category_priors)s, NOW())
            ON CONFLICT (id) DO UPDATE SET
                display_name    = EXCLUDED.display_name,
                seed_prompt     = EXCLUDED.seed_prompt,
                embedding       = EXCLUDED.embedding,
                category_priors = EXCLUDED.category_priors,
                updated_at      = NOW()
            """,
            {
                "id": mood["id"],
                "display_name": mood["display_name"],
                "seed_prompt": mood["seed_prompt"],
                "embedding": str(mood["embedding"]).replace(" ", ""),
                "category_priors": Jsonb(mood.get("category_priors", {})),
            },
        )
    await conn.commit()


async def backfill_mood_affinities_batch(
    conn: psycopg.AsyncConnection[Any], batch_size: int = 100
) -> int:
    """Compute cosine affinity between site embeddings and all mood embeddings.

    Uses a single SQL UPDATE with pgvector <=> operator (cosine distance).
    Processes only rows where mood_affinities is empty and embedding is non-null.
    Returns the number of rows updated.
    """
    async with conn.cursor() as cur:
        await cur.execute(
            """
            WITH mood_vecs AS (
                SELECT id, embedding FROM moods
            ),
            site_batch AS (
                SELECT id, embedding
                FROM site_cache
                WHERE embedding IS NOT NULL
                  AND (mood_affinities = '{}'::jsonb OR mood_affinities IS NULL)
                LIMIT %(batch_size)s
            ),
            affinities AS (
                SELECT
                    sb.id,
                    jsonb_object_agg(
                        mv.id,
                        ROUND((1.0 - (sb.embedding <=> mv.embedding))::numeric, 4)
                    ) AS aff
                FROM site_batch sb
                CROSS JOIN mood_vecs mv
                GROUP BY sb.id
            )
            UPDATE site_cache sc
            SET mood_affinities = aff.aff
            FROM affinities aff
            WHERE sc.id = aff.id
            """,
            {"batch_size": batch_size},
        )
        count = int(cur.rowcount)
    await conn.commit()
    return count


# ═══════════════════════════════════════════════════════════════════════════════
# Ingest attempts helpers
# ═══════════════════════════════════════════════════════════════════════════════


async def insert_ingest_attempt(
    conn: psycopg.AsyncConnection[Any],
    url: str,
    source: str,
    url_hash: str | None = None,
) -> bool:
    """Insert a URL into ingest_attempts for background processing.

    Deduplicates by url_hash. Returns True if inserted, False if already exists.
    """
    import hashlib

    h = url_hash or hashlib.sha256(url.encode()).hexdigest()
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO ingest_attempts (url_hash, url, source)
            VALUES (%s, %s, %s)
            ON CONFLICT (url_hash) DO NOTHING
            """,
            (h, url, source),
        )
        inserted: bool = bool(cur.rowcount > 0)
    await conn.commit()
    return inserted


async def get_pending_ingest_batch(
    conn: psycopg.AsyncConnection[Any], batch_size: int = 20
) -> list[dict[str, Any]]:
    """Fetch the next batch of pending ingest attempts and mark them as 'crawling'."""
    async with conn.cursor() as cur:
        await cur.execute(
            """
            WITH batch AS (
                SELECT url_hash FROM ingest_attempts
                WHERE status = 'pending'
                LIMIT %(batch_size)s
                FOR UPDATE SKIP LOCKED
            )
            UPDATE ingest_attempts ia
            SET status = 'crawling', last_try_at = NOW(), attempts = attempts + 1
            FROM batch
            WHERE ia.url_hash = batch.url_hash
            RETURNING ia.url_hash, ia.url, ia.source, ia.attempts
            """,
            {"batch_size": batch_size},
        )
        rows = await cur.fetchall()
    await conn.commit()
    return [dict(r) for r in rows]


async def update_ingest_status(
    conn: psycopg.AsyncConnection[Any],
    url_hash: str,
    status: str,
    reject_reason: str | None = None,
) -> None:
    """Update the status of an ingest attempt after processing."""
    async with conn.cursor() as cur:
        await cur.execute(
            """
            UPDATE ingest_attempts
            SET status = %s, reject_reason = %s, last_try_at = NOW()
            WHERE url_hash = %s
            """,
            (status, reject_reason, url_hash),
        )
    await conn.commit()


async def reset_stuck_crawling(
    conn: psycopg.AsyncConnection[Any], stuck_after_minutes: int = 10
) -> int:
    """Reset 'crawling' rows that have been stuck longer than stuck_after_minutes.

    Called at the start of each ingest_batch run to recover from task timeouts
    that left rows in 'crawling' without updating them to a terminal status.
    """
    async with conn.cursor() as cur:
        await cur.execute(
            """
            UPDATE ingest_attempts
            SET status = 'pending', last_try_at = NULL
            WHERE status = 'crawling'
              AND last_try_at < NOW() - INTERVAL '1 minute' * %(minutes)s
            """,
            {"minutes": stuck_after_minutes},
        )
        count = int(cur.rowcount)
    await conn.commit()
    return count


async def get_pending_ingest_count(conn: psycopg.AsyncConnection[Any]) -> int:
    """Return the number of pending ingest_attempts rows (for backpressure checks)."""
    async with conn.cursor() as cur:
        await cur.execute("SELECT COUNT(*) FROM ingest_attempts WHERE status = 'pending'")
        row = await cur.fetchone()
        return int(row[0]) if row else 0


# ═══════════════════════════════════════════════════════════════════════════════
# RSS feed registry helpers
# ═══════════════════════════════════════════════════════════════════════════════


async def insert_rss_feed(
    conn: psycopg.AsyncConnection[Any],
    url: str,
    category_hint: str = "general",
) -> bool:
    """Register a feed URL in rss_feeds. Returns True if inserted, False if duplicate."""
    import hashlib

    h = hashlib.sha256(url.encode()).hexdigest()
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO rss_feeds (url_hash, url, category_hint)
            VALUES (%s, %s, %s)
            ON CONFLICT (url_hash) DO NOTHING
            """,
            (h, url, category_hint),
        )
        inserted: bool = bool(cur.rowcount > 0)
    await conn.commit()
    return inserted


async def get_active_rss_feeds(
    conn: psycopg.AsyncConnection[Any],
) -> list[dict[str, Any]]:
    """Return all active feed rows as {url, category_hint}."""
    async with conn.cursor() as cur:
        await cur.execute("SELECT url, category_hint FROM rss_feeds WHERE status = 'active'")
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def mark_rss_feed_harvested(
    conn: psycopg.AsyncConnection[Any],
    url: str,
    item_count: int,
) -> None:
    """Record a successful harvest run for a feed URL."""
    import hashlib

    h = hashlib.sha256(url.encode()).hexdigest()
    async with conn.cursor() as cur:
        await cur.execute(
            """
            UPDATE rss_feeds
            SET last_harvested_at = NOW(), last_item_count = %s
            WHERE url_hash = %s
            """,
            (item_count, h),
        )
    await conn.commit()


async def get_stale_sites_batch(
    conn: psycopg.AsyncConnection[Any], batch_size: int = 20
) -> list[dict[str, Any]]:
    """Return site_cache rows past their rescore_at date."""
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
    return [dict(r) for r in rows]


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 3 serving helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _parse_vector(v: str | list[float] | None) -> list[float] | None:
    """Parse a pgvector string like '[0.1,0.2,...]' into a list of floats."""
    if v is None:
        return None
    if isinstance(v, list):
        return v
    try:
        return list(map(float, str(v).strip("[]").split(",")))
    except (ValueError, AttributeError):
        return None


async def get_mood_by_id(conn: psycopg.AsyncConnection[Any], mood_id: str) -> dict[str, Any] | None:
    """Return a mood row including its embedding vector."""
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT id, display_name, embedding, category_priors FROM moods WHERE id = %s",
            (mood_id,),
        )
        row = await cur.fetchone()
    if not row:
        return None
    d = dict(row)
    d["embedding"] = _parse_vector(d.get("embedding"))
    return d


async def get_profile_embedding(
    conn: psycopg.AsyncConnection[Any], session_id: str
) -> list[float] | None:
    """Return the curiosity_profiles embedding for a session, or None."""
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT embedding FROM curiosity_profiles
            WHERE session_id = %s::uuid
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (session_id,),
        )
        row = await cur.fetchone()
    if not row or row["embedding"] is None:
        return None
    return _parse_vector(row["embedding"])


async def retrieve_candidates_sql(
    conn: psycopg.AsyncConnection[Any],
    query_vec: list[float],
    exclude_url_hashes: list[str],
    quality_min: float = 0.65,
    limit: int = 60,
) -> list[dict[str, Any]]:
    """Fetch candidate sites from site_cache via pgvector ANN search.

    Returns rows ordered by cosine distance to query_vec, filtered by status+quality.
    Falls back to quality-score ordering for rows without embeddings.
    Embeddings are parsed back to list[float].
    """
    vec_literal = str(query_vec).replace(" ", "")
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT
                id, url, url_hash, title, description, content_summary,
                extracted_images, quality_score, categories, mood_affinities,
                embedding, popularity, last_shown_at, ingested_at, status
            FROM site_cache
            WHERE status = 'ready'
              AND quality_score >= %(quality_min)s
              AND (%(exclude_count)s = 0 OR url_hash != ALL(%(exclude_hashes)s::text[]))
            ORDER BY
                CASE WHEN embedding IS NOT NULL
                     THEN embedding <=> %(query_vec)s::vector
                END ASC NULLS LAST,
                quality_score DESC
            LIMIT %(limit)s
            """,
            {
                "quality_min": quality_min,
                "exclude_count": len(exclude_url_hashes),
                "exclude_hashes": exclude_url_hashes or [],
                "query_vec": vec_literal,
                "limit": limit,
            },
        )
        rows = await cur.fetchall()

    result = []
    for row in rows:
        d = dict(row)
        d["embedding"] = _parse_vector(d.get("embedding"))
        result.append(d)
    return result


async def retrieve_fallback_candidates_sql(
    conn: psycopg.AsyncConnection[Any],
    mood_id: str,
    topics: list[str],
    exclude_url_hashes: list[str],
    quality_min: float = 0.65,
    limit: int = 60,
) -> list[dict[str, Any]]:
    """Fetch a best-effort batch when vector serving cannot produce candidates.

    Orders by any precomputed mood affinity first, then topic overlap, then
    quality/novelty signals so discovery can still return a usable batch when
    mood embeddings or ANN search are unavailable.
    """
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT
                id, url, url_hash, title, description, content_summary,
                extracted_images, quality_score, categories, mood_affinities,
                embedding, popularity, last_shown_at, ingested_at, status
            FROM site_cache
            WHERE status = 'ready'
              AND quality_score >= %(quality_min)s
              AND (%(exclude_count)s = 0 OR url_hash != ALL(%(exclude_hashes)s::text[]))
            ORDER BY
                COALESCE((mood_affinities ->> %(mood_id)s)::float8, 0) DESC,
                CASE
                    WHEN %(topic_count)s = 0 THEN 0
                    ELSE (
                        SELECT COUNT(*)
                        FROM jsonb_array_elements_text(
                            COALESCE(categories, '[]'::jsonb)
                        ) AS category(value)
                        WHERE category.value = ANY(%(topics)s::text[])
                    )
                END DESC,
                quality_score DESC,
                popularity ASC,
                last_shown_at ASC NULLS FIRST,
                ingested_at DESC
            LIMIT %(limit)s
            """,
            {
                "mood_id": mood_id,
                "topics": topics,
                "topic_count": len(topics),
                "quality_min": quality_min,
                "exclude_count": len(exclude_url_hashes),
                "exclude_hashes": exclude_url_hashes or [],
                "limit": limit,
            },
        )
        rows = await cur.fetchall()

    result = []
    for row in rows:
        d = dict(row)
        d["embedding"] = _parse_vector(d.get("embedding"))
        result.append(d)
    return result


async def get_blurbs_from_cache(
    conn: psycopg.AsyncConnection[Any],
    site_mood_pairs: list[tuple[str, str]],
) -> dict[tuple[str, str], str]:
    """Bulk-fetch blurbs from blurb_cache. Returns {(site_id, mood_id): blurb}."""
    if not site_mood_pairs:
        return {}
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT site_cache_id::text, mood_id, blurb
            FROM blurb_cache
            WHERE site_cache_id::text = ANY(%(site_ids)s::text[])
              AND mood_id = ANY(%(mood_ids)s::text[])
            """,
            {
                "site_ids": [p[0] for p in site_mood_pairs],
                "mood_ids": [p[1] for p in site_mood_pairs],
            },
        )
        rows = await cur.fetchall()
    return {(str(row["site_cache_id"]), row["mood_id"]): row["blurb"] for row in rows}


async def set_blurbs_in_cache(
    conn: psycopg.AsyncConnection[Any],
    entries: list[dict[str, Any]],
) -> None:
    """Insert or update blurb_cache rows.

    entries: list of {site_cache_id, mood_id, blurb, model}.
    """
    if not entries:
        return
    async with conn.cursor() as cur:
        for entry in entries:
            await cur.execute(
                """
                INSERT INTO blurb_cache (site_cache_id, mood_id, blurb, model, generated_at)
                VALUES (%s::uuid, %s, %s, %s, NOW())
                ON CONFLICT (site_cache_id, mood_id) DO UPDATE SET
                    blurb        = EXCLUDED.blurb,
                    model        = EXCLUDED.model,
                    generated_at = NOW()
                """,
                (
                    entry["site_cache_id"],
                    entry["mood_id"],
                    entry["blurb"],
                    entry["model"],
                ),
            )
    await conn.commit()


async def purge_old_blurb_cache(conn: psycopg.AsyncConnection[Any], days: int = 30) -> int:
    """Delete blurb_cache entries older than `days` days. Returns deleted count."""
    async with conn.cursor() as cur:
        await cur.execute(
            "DELETE FROM blurb_cache WHERE generated_at < NOW() - (%(days)s || ' days')::interval",
            {"days": days},
        )
        count = int(cur.rowcount)
    await conn.commit()
    return count


async def get_unwarmed_site_mood_pairs(
    conn: psycopg.AsyncConnection[Any],
    site_ids: list[str] | None = None,
    min_quality: float = 0.65,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Return (site, mood_id) pairs that are missing a blurb_cache entry.

    Used by the prewarm_blurbs task to fill blurb_cache ahead of user requests.
    If site_ids is provided, only those sites are checked (reactive trigger after ingest).
    Otherwise, queries all ready sites above min_quality ordered by quality desc.
    """
    async with conn.cursor() as cur:
        if site_ids:
            await cur.execute(
                """
                SELECT sc.id::text, sc.url, sc.title, sc.description,
                       sc.content_summary, sc.categories, m.id AS mood_id
                FROM site_cache sc
                CROSS JOIN moods m
                LEFT JOIN blurb_cache bc
                       ON bc.site_cache_id = sc.id AND bc.mood_id = m.id
                WHERE sc.status = 'ready'
                  AND sc.id::text = ANY(%(site_ids)s::text[])
                  AND bc.site_cache_id IS NULL
                LIMIT %(limit)s
                """,
                {"site_ids": site_ids, "limit": limit},
            )
        else:
            await cur.execute(
                """
                SELECT sc.id::text, sc.url, sc.title, sc.description,
                       sc.content_summary, sc.categories, m.id AS mood_id
                FROM site_cache sc
                CROSS JOIN moods m
                LEFT JOIN blurb_cache bc
                       ON bc.site_cache_id = sc.id AND bc.mood_id = m.id
                WHERE sc.status = 'ready'
                  AND sc.quality_score >= %(min_quality)s
                  AND bc.site_cache_id IS NULL
                ORDER BY sc.quality_score DESC
                LIMIT %(limit)s
                """,
                {"min_quality": min_quality, "limit": limit},
            )
        rows = await cur.fetchall()
    return [dict(r) for r in rows]
