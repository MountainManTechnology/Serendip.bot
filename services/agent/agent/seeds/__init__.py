"""Seed URL management — curated seeds, RSS, and sitemap ingestion.

Phase 2: Seeds now write to `ingest_attempts` (Postgres) for background
evaluation, instead of directly to Redis sets.  The `seeds:category:*` Redis
sets are still written for backward compatibility with the existing serving
path (removed in Phase 5 cleanup).
"""

from __future__ import annotations

import asyncio
import hashlib
import re
from pathlib import Path
from xml.etree import ElementTree

import httpx
import yaml  # type: ignore[import-untyped]
from redis.asyncio import Redis

from agent.config import settings
from agent.logging import log

SEEDS_DIR = Path(__file__).parent

# Domains that should never enter the pool
BLACKLIST_PATTERNS = [
    r"(facebook|twitter|instagram|tiktok|youtube|reddit|linkedin|pinterest)\.com",
    r"(login|signin|signup|register|auth)\.",
    r"\.(pdf|zip|exe|dmg|pkg)$",
    r"(paywall|subscribe|premium)\.",
]

_blacklist_re = [re.compile(p, re.IGNORECASE) for p in BLACKLIST_PATTERNS]

# Common sitemap sources for curated domains
_SITEMAP_SOURCES = [
    "https://www.quantamagazine.org/sitemap.xml",
    "https://aeon.co/sitemap.xml",
    "https://www.nautil.us/sitemap.xml",
]


def is_blacklisted(url: str) -> bool:
    return any(r.search(url) for r in _blacklist_re)


def url_hash(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()


async def _try_insert_ingest_attempt(url: str, source: str) -> bool:
    """Insert a URL into ingest_attempts. Returns True if inserted, False otherwise."""
    try:
        from agent.db import get_connection, insert_ingest_attempt

        conn = await get_connection()
        async with conn:
            return await insert_ingest_attempt(conn, url, source)
    except Exception as exc:
        log.debug("ingest_attempt_insert_failed", url=url, error=str(exc))
        return False


async def load_seed_files(redis: Redis) -> int:  # type: ignore[type-arg]
    """Load YAML seed files from seeds/ directory.

    Phase 2: writes to ingest_attempts (DB) for background evaluation.
    Still writes seeds:category:* Redis sets for backward compat.
    """
    added = 0
    for seed_file in SEEDS_DIR.glob("*.yaml"):
        data = yaml.safe_load(seed_file.read_text())
        urls: list[str] = data.get("urls", [])
        for url in urls:
            if not is_blacklisted(url):
                inserted = await _try_insert_ingest_attempt(url, "seed_yaml")
                if inserted:
                    added += 1
    log.info("seeds_loaded", added=added)
    return added


async def ingest_rss(
    redis: Redis,  # type: ignore[type-arg]
    feed_map: dict[str, str] | list[str],
) -> int:
    """Pull URLs from RSS/Atom feeds and queue for ingestion.

    feed_map may be either:
      - a {feed_url: category_hint} dict (preferred — marks harvest in rss_feeds table)
      - a plain list[str] of feed URLs (legacy; treated as category 'general')
    """
    if isinstance(feed_map, list):
        feed_map = {url: "general" for url in feed_map}

    added = 0
    async with httpx.AsyncClient(timeout=10.0) as client:
        for feed_url, _category in feed_map.items():
            item_count = 0
            try:
                resp = await client.get(feed_url)
                root = ElementTree.fromstring(resp.text)
                ns = {"atom": "http://www.w3.org/2005/Atom"}

                # RSS items
                for item in root.findall(".//item/link"):
                    url = item.text or ""
                    if url and not is_blacklisted(url):
                        inserted = await _try_insert_ingest_attempt(url, "rss")
                        if inserted:
                            added += 1
                            item_count += 1

                # Atom entries
                for entry in root.findall(".//atom:entry/atom:link", ns):
                    url = entry.get("href", "")
                    if url and not is_blacklisted(url):
                        inserted = await _try_insert_ingest_attempt(url, "rss")
                        if inserted:
                            added += 1
                            item_count += 1

                # Record successful harvest against the registry (best-effort)
                try:
                    from agent.db import get_connection, mark_rss_feed_harvested

                    conn = await get_connection()
                    async with conn:
                        await mark_rss_feed_harvested(conn, feed_url, item_count)
                except Exception:
                    pass  # Registry update is non-critical

            except Exception as exc:
                log.warning("rss_ingest_failed", feed=feed_url, error=str(exc))

    log.info("rss_ingested", added=added)
    return added


async def ingest_sitemaps(sitemap_urls: list[str] | None = None) -> int:
    """Parse XML sitemaps and queue article URLs for ingestion.

    Handles both sitemap index files (sitemapindex) and regular sitemaps (urlset).
    """
    urls_to_check = sitemap_urls or _SITEMAP_SOURCES
    added = 0

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        for sitemap_url in urls_to_check:
            try:
                resp = await client.get(sitemap_url)
                if resp.status_code != 200:
                    log.warning("sitemap_fetch_failed", url=sitemap_url, status=resp.status_code)
                    continue

                root = ElementTree.fromstring(resp.text)
                ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

                # Sitemap index — recurse one level
                child_sitemaps = root.findall("sm:sitemap/sm:loc", ns)
                if child_sitemaps:
                    child_urls = [el.text for el in child_sitemaps if el.text]
                    # Only process most recent 3 child sitemaps to avoid flooding
                    added += await ingest_sitemaps(child_urls[:3])
                    continue

                # Regular sitemap urlset
                for loc in root.findall("sm:url/sm:loc", ns):
                    url = loc.text or ""
                    if url and not is_blacklisted(url):
                        inserted = await _try_insert_ingest_attempt(url, "sitemap")
                        if inserted:
                            added += 1

            except Exception as exc:
                log.warning("sitemap_ingest_failed", url=sitemap_url, error=str(exc))

    log.info("sitemaps_ingested", added=added)
    return added


async def refresh(redis: Redis | None = None) -> None:  # type: ignore[type-arg]
    """Cron entry point: refresh seed pool from files, RSS feeds, and sitemaps."""
    if redis is None:
        redis = Redis.from_url(settings.redis_url, decode_responses=True)  # type: ignore[no-untyped-call]

    await load_seed_files(redis)

    # Hardcoded fallback feeds (always harvested, not stored in rss_feeds table)
    hardcoded: dict[str, str] = {
        "https://news.ycombinator.com/rss": "technology",
        "https://feeds.kottke.org/main": "culture",
        "https://www.theverge.com/rss/index.xml": "technology",
        "https://aeon.co/feed.rss": "philosophy",
    }

    # Merge with dynamically registered feeds from the rss_feeds DB table
    feed_map: dict[str, str] = dict(hardcoded)
    try:
        from agent.db import get_active_rss_feeds, get_connection

        conn = await get_connection()
        async with conn:
            db_feeds = await get_active_rss_feeds(conn)
        for row in db_feeds:
            feed_map.setdefault(row["url"], row["category_hint"])
        log.info("rss_feeds_loaded", total=len(feed_map), from_db=len(db_feeds))
    except Exception as exc:
        log.warning("rss_feeds_db_load_failed", error=str(exc))

    await ingest_rss(redis, feed_map)
    await ingest_sitemaps()


if __name__ == "__main__":
    asyncio.run(refresh())
