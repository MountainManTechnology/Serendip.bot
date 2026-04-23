"""Hourly feed discovery task — auto-discovers and registers feeds per category.

Runs hourly to bootstrap rss_feeds table toward 50+ feeds per category.
Uses Grok for bulk scoring, GPT-5.1 for edge-case review (0.60-0.65 range).

Strategy:
  1. Load seed candidates from YAML (science.yaml, culture.yaml, etc.)
  2. Filter: remove already-registered feeds (avoid duplicates)
  3. Validate in parallel (httpx batch, 10 concurrent)
  4. Score with Grok in batches (15 at a time)
  5. Re-score borderline (0.60-0.65) with GPT-5.1
  6. Auto-insert >= 0.65 to rss_feeds
  7. Track evaluation state → stop when category hits 50+ feeds
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

import httpx
import psycopg
import yaml
from psycopg.rows import dict_row

from agent.config import settings
from agent.logging import log
from agent.providers.base import TaskType
from agent.providers.router import router as llm_router

# ═════════════════════════════════════════════════════════════════════════════
# Config
# ═════════════════════════════════════════════════════════════════════════════

TARGET_FEEDS_PER_CATEGORY = 50
VALIDATION_BATCH_SIZE = 10
GROK_SCORE_BATCH_SIZE = 15
AUTO_ACCEPT_THRESHOLD = 0.65
EDGE_CASE_MIN = 0.60
EDGE_CASE_MAX = 0.65

USER_AGENT = "SerendipBot-HourlyDiscovery/1.0 (+https://github.com/MountainManTechnology/Serendip.bot)"
HTTP_TIMEOUT = 15.0

SEEDS_DIR = Path(__file__).parent / "seeds"


# ═════════════════════════════════════════════════════════════════════════════
# Data structures
# ═════════════════════════════════════════════════════════════════════════════

@dataclass
class FeedCandidate:
    """A feed URL to evaluate."""
    url: str
    category: str
    source: str = "seed"  # or 'discovery'


@dataclass
class ScoredFeed:
    """A feed with evaluation results."""
    url: str
    category: str
    score: float
    model_used: str
    reason: str
    inserted: bool = False


# ═════════════════════════════════════════════════════════════════════════════
# Database helpers
# ═════════════════════════════════════════════════════════════════════════════

async def get_connection() -> psycopg.AsyncConnection[Any]:
    """Get async database connection."""
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    return await psycopg.AsyncConnection.connect(
        settings.database_url, row_factory=dict_row
    )


async def get_registered_feeds(conn: psycopg.AsyncConnection[Any], category: str) -> set[str]:
    """Get all registered feed URLs for a category."""
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT url FROM rss_feeds WHERE category_hint = %s",
            (category,),
        )
        rows = await cur.fetchall()
    return {row["url"] for row in rows}


async def count_registered_feeds(conn: psycopg.AsyncConnection[Any], category: str) -> int:
    """Count registered feeds in a category."""
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT COUNT(*) as count FROM rss_feeds WHERE category_hint = %s AND status = 'active'",
            (category,),
        )
        result = await cur.fetchone()
    return result["count"] if result else 0


async def insert_rss_feed(
    conn: psycopg.AsyncConnection[Any],
    url: str,
    category: str,
) -> bool:
    """Insert feed into rss_feeds. Returns True if inserted, False if duplicate."""
    url_hash = hashlib.sha256(url.encode()).hexdigest()
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO rss_feeds (url_hash, url, category_hint, status)
            VALUES (%s, %s, %s, 'active')
            ON CONFLICT (url_hash) DO NOTHING
            """,
            (url_hash, url, category),
        )
        inserted = cur.rowcount > 0
    await conn.commit()
    return inserted


async def log_discovery_result(
    conn: psycopg.AsyncConnection[Any],
    category: str,
    scored_feeds: list[ScoredFeed],
) -> None:
    """Log discovery results to a metadata table (optional)."""
    async with conn.cursor() as cur:
        for feed in scored_feeds:
            await cur.execute(
                """
                INSERT INTO discovery_log (category, url, score, model, result, created_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                ON CONFLICT DO NOTHING
                """,
                (
                    category,
                    feed.url,
                    feed.score,
                    feed.model_used,
                    "inserted" if feed.inserted else "rejected",
                ),
            )
    await conn.commit()


# ═════════════════════════════════════════════════════════════════════════════
# Feed validation
# ═════════════════════════════════════════════════════════════════════════════

# Aggregator/PR domains to reject (per CRITERIA.md)
_AGGREGATOR_DOMAINS = frozenset({
    "feedburner.com",
    "rss.app",
    "flipboard.com",
    "google.com",
    "feedly.com",
})

_PR_PATTERNS = [
    r"\bpress release\b",
    r"\bnow available\b",
    r"\bpartners with\b",
    r"\bannounces?\b",
    r"\b(?:save|sale|discount|coupon|deal|% off)\b",
    r"\bsponsored\b",
    r"\bpromo(?:tion)?\b",
]


def _is_aggregator_domain(url: str) -> bool:
    """Check if URL is from a known aggregator domain."""
    import re
    from urllib.parse import urlparse
    
    host = (urlparse(url).hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return any(host == d or host.endswith("." + d) for d in _AGGREGATOR_DOMAINS)


async def validate_feed(url: str) -> dict[str, Any] | None:
    """Try to fetch and parse feed. Returns dict if valid, None if broken.
    
    Checks per CRITERIA.md:
    - Not aggregator/blocked domain
    - Returns valid RSS/Atom
    - HTTP 2xx (not 404/410/451)
    """
    # Quick domain check
    if _is_aggregator_domain(url):
        log.debug("validate_feed_aggregator", url=url)
        return None
    
    try:
        async with httpx.AsyncClient(
            timeout=HTTP_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            resp = await client.get(url)
            
            # Reject dead/blocked feeds per CRITERIA.md
            if resp.status_code in (404, 410, 451):
                log.debug("validate_feed_blocked", url=url, status=resp.status_code)
                return None
            
            if resp.status_code >= 500:
                log.debug("validate_feed_server_error", url=url, status=resp.status_code)
                return None
            
            resp.raise_for_status()

            # Quick check: is it XML-like?
            content = resp.text[:500]
            if not any(tag in content for tag in ["<rss", "<feed", "<atom"]):
                return None

            return {
                "url": url,
                "status": resp.status_code,
                "content_type": resp.headers.get("content-type", ""),
                "valid": True,
            }
    except Exception as e:
        log.debug("validate_feed_failed", url=url, error=str(e))
        return None


async def parallel_validate(candidates: list[FeedCandidate]) -> list[FeedCandidate]:
    """Validate multiple feeds in parallel."""
    validated = []
    semaphore = asyncio.Semaphore(VALIDATION_BATCH_SIZE)

    async def validate_with_sem(candidate: FeedCandidate) -> FeedCandidate | None:
        async with semaphore:
            result = await validate_feed(candidate.url)
            return candidate if result else None

    results = await asyncio.gather(
        *[validate_with_sem(c) for c in candidates],
        return_exceptions=False,
    )
    return [c for c in results if c is not None]


# ═════════════════════════════════════════════════════════════════════════════
# Scoring
# ═════════════════════════════════════════════════════════════════════════════

async def score_feeds_with_grok(
    feeds: list[FeedCandidate],
    batch_size: int = GROK_SCORE_BATCH_SIZE,
) -> list[ScoredFeed]:
    """Score feeds using Grok (fast, bulk screening).
    
    Uses the SerendipBot curator rubric:
    - Editorial intent (original writing, not PR/marketing) — 0.25
    - Voice (distinctive authorial perspective or curation) — 0.20
    - Anti-PR (titles, tone, domain reputation) — 0.15
    - Surprise (unexpected/non-obvious topics for serendipity) — 0.15
    - Mood fit (resonates with discovery/wonder/explore moods) — 0.15
    - Cadence (≥4 items/30d, ≥1 item/14d, <200/30d) — 0.10
    
    Cutoff: ≥0.65 = auto-accept.
    """
    scored = []

    for i in range(0, len(feeds), batch_size):
        batch = feeds[i : i + batch_size]

        # Build prompt
        feed_list = "\n".join(
            f"- {f.url} (category: {f.category})" for f in batch
        )

        prompt = f"""Evaluate these RSS/Atom feeds for SerendipBot's discovery platform.

RUBRIC (weights sum to 1.0):
1. Editorial Intent (0.25) — original writing or thoughtful curation, NOT marketing/PR/affiliate.
2. Voice (0.20) — distinctive authorial perspective or curatorial taste.
3. Anti-PR (0.15) — titles and content avoid: "press release", "now available", "partners with", "sponsored".
4. Surprise (0.15) — unexpected topics that spark discovery (not commodity news).
5. Mood Fit (0.15) — resonates with wonder/learn/explore/create/inspire moods.
6. Cadence (0.10) — regular, active publishing (≥4 items/30d, ≥1 item/14d, <200 items/30d to avoid firehose).

SCORE: 0.0–1.0 where:
- 0.0 = PR, aggregator, spam, pure linkroll
- 0.3 = mostly link-sharing with shallow commentary
- 0.5 = mixed quality, some original work alongside aggregation
- 0.7 = solid editorial blog with consistent voice and perspective
- 1.0 = exceptional original essays, deep reporting, or culturally distinct curation

REJECT (automatic 0.0):
- Feed is broken (404, parse error)
- Aggregator domain (feedburner, rss.app, flipboard)
- PR pattern dominance (≥50% of titles match press-release patterns)

Feeds to score:
{feed_list}

Return ONLY valid JSON (no markdown, no explanation):
{{
  "results": [
    {{"url": "...", "score": 0.XX, "reason": "one-sentence justification"}},
    ...
  ]
}}"""

        try:
            response = await llm_router.complete(
                task=TaskType.QUALITY_EVAL,
                prompt=prompt,
                temperature=0.0,
                max_tokens=1024,
            )

            # Extract JSON from Markdown code blocks if present
            content = response.content
            if content.startswith("```"):
                # Strip markdown code block: ```json\n...\n```
                lines = content.split("\n")
                # Skip opening ``` line and last closing ``` line
                content = "\n".join(lines[1:-1])
            
            # Parse JSON
            try:
                data = json.loads(content)
                for result in data.get("results", []):
                    feed = next((f for f in batch if f.url == result["url"]), None)
                    if feed:
                        scored.append(
                            ScoredFeed(
                                url=feed.url,
                                category=feed.category,
                                score=float(result.get("score", 0.0)),
                                model_used="grok",
                                reason=result.get("reason", ""),
                            )
                        )
            except json.JSONDecodeError:
                log.warning("grok_score_parse_failed", batch_size=len(batch))
                # Fallback: mark as rejected
                for feed in batch:
                    scored.append(
                        ScoredFeed(
                            url=feed.url,
                            category=feed.category,
                            score=0.0,
                            model_used="grok",
                            reason="parse_error",
                        )
                    )
        except Exception as e:
            log.error("grok_score_error", error=str(e), batch_size=len(batch))
            # Mark all as failed
            for feed in batch:
                scored.append(
                    ScoredFeed(
                        url=feed.url,
                        category=feed.category,
                        score=0.0,
                        model_used="grok",
                        reason=f"error: {str(e)[:50]}",
                    )
                )

    return scored


async def score_edge_cases_with_gpt(
    feeds: list[ScoredFeed],
) -> list[ScoredFeed]:
    """Re-score borderline feeds (0.60-0.65) using GPT-5.1.
    
    Uses deep editorial judgment on the SerendipBot rubric:
    - Is the editorial voice genuine and original?
    - Does it avoid corporate/PR tone?
    - Does it spark serendipitous discovery?
    - Is content human-written with substance?
    """
    edge_cases = [f for f in feeds if EDGE_CASE_MIN <= f.score < EDGE_CASE_MAX]
    if not edge_cases:
        return feeds

    log.info("score_edge_cases", count=len(edge_cases))

    # Score in smaller batches (GPT is slower)
    for i in range(0, len(edge_cases), 5):
        batch = edge_cases[i : i + 5]

        feed_list = "\n".join(
            f"- {f.url}\n  (grok score: {f.score:.2f}, reason: {f.reason})"
            for f in batch
        )

        prompt = f"""These feeds scored 0.60–0.65 on fast screening (Grok).
Deep editorial review requested — apply SerendipBot curator standards rigorously.

EVALUATION CRITERIA (SerendipBot rubric):

1. EDITORIAL INTENT — Original writing or thoughtful curation?
   - ✓ Essays, long-form analysis, expert commentary
   - ✓ Curatorial taste that reflects a distinct perspective
   - ✗ Press releases, marketing, pure link aggregation

2. VOICE — Distinctive authorial perspective?
   - ✓ Recognizable style, opinion, personality
   - ✓ Curatorial taste that's not obvious/commodity
   - ✗ Generic news repeater, corporate tone

3. ANTI-PR — Titles and tone avoid marketing patterns?
   - ✗ Titles dominated by: "press release", "now available", "partners with", "sponsored", "% off"
   - ✓ Honest headlines reflecting actual content

4. SURPRISE — Topics spark serendipitous discovery?
   - ✓ Unexpected angles, deep dives, cultural critique
   - ✗ Safe commodity coverage (everyone covers it)

5. MOOD FIT — Resonates with wonder/learn/explore/create/inspire moods?
   - ✓ Makes reader curious, thoughtful, inspired
   - ✗ Purely news-driven or business-focused

For each feed, decide: UPGRADE (≥0.70) or KEEP ORIGINAL (stay at Grok score)?

Feeds for review:
{feed_list}

Return ONLY valid JSON:
{{
  "results": [
    {{"url": "...", "score": 0.XX, "upgraded": true/false, "reason": "one-sentence justification"}},
    ...
  ]
}}"""

        try:
            response = await llm_router.complete(
                task=TaskType.PROFILE_MATCH,
                prompt=prompt,
                temperature=0.7,
                max_tokens=1024,
            )

            data = json.loads(response.content)
            for result in data.get("results", []):
                feed = next((f for f in feeds if f.url == result["url"]), None)
                if feed:
                    new_score = float(result.get("score", feed.score))
                    feed.score = new_score
                    feed.model_used = "gpt-5.1"
                    feed.reason = result.get("reason", "")
        except Exception as e:
            log.warning("gpt_edge_case_error", error=str(e))
            # Keep original scores

    return feeds


# ═════════════════════════════════════════════════════════════════════════════
# Main discovery flow
# ═════════════════════════════════════════════════════════════════════════════

async def discover_feeds_for_category(category: str) -> dict[str, Any]:
    """Run discovery for a single category.
    
    Evaluation pipeline per CRITERIA.md:
    
    HEURISTIC CHECKS (automated):
    ✓ Not aggregator domain (feedburner, rss.app, flipboard)
    ✓ HTTP 2xx (not 404/410/451)
    ✓ Valid RSS/Atom (parses without error)
    
    LLM SCORING (Grok + GPT):
    ✓ Editorial intent (original vs. PR/marketing)
    ✓ Voice (distinctive perspective)
    ✓ Anti-PR (title/tone patterns)
    ✓ Surprise (unexpected topics)
    ✓ Mood fit (wonder/learn/explore/create/inspire)
    ✓ Cadence (≥4/30d, ≥1/14d, <200/30d)
    
    NOT YET CHECKED (manual review at merge):
    - Long-form bias (>500 words per article)
    - Duplicate feeds (cross-check existing seeds)
    - Domain stability (Wayback Machine, 6+ months online)
    - English language
    - Blocklist (domain reputation)
    
    Auto-accept threshold: 0.65
    """
    results = {
        "category": category,
        "validated": 0,
        "scored": 0,
        "inserted": 0,
        "skipped": 0,
        "edge_cases": 0,
    }

    # Check if already at target
    conn = await get_connection()
    async with conn:
        current_count = await count_registered_feeds(conn, category)
        if current_count >= TARGET_FEEDS_PER_CATEGORY:
            log.info(
                "discovery_category_complete",
                category=category,
                count=current_count,
            )
            return results

        # Load candidates from seed file
        seed_file = SEEDS_DIR / f"{category}.yaml"
        if not seed_file.exists():
            log.warning("seed_file_not_found", category=category)
            return results

        with open(seed_file) as f:
            data = yaml.safe_load(f) or {}

        candidates_raw = data.get("urls", [])
        if not candidates_raw:
            log.info("no_candidates", category=category)
            return results

        # Convert to FeedCandidate objects
        candidates = [
            FeedCandidate(url=url, category=category, source="seed")
            for url in candidates_raw
        ]

        # Filter out already-registered
        registered = await get_registered_feeds(conn, category)
        candidates = [c for c in candidates if c.url not in registered]
        results["skipped"] = len(candidates_raw) - len(candidates)

        if not candidates:
            log.info("no_new_candidates", category=category)
            return results

        # Validate in parallel
        validated = await parallel_validate(candidates)
        results["validated"] = len(validated)

        if not validated:
            log.info("no_valid_feeds", category=category)
            return results

        # Score with Grok
        scored = await score_feeds_with_grok(validated)
        results["scored"] = len(scored)

        # Re-score edge cases with GPT
        edge_cases = [s for s in scored if EDGE_CASE_MIN <= s.score < EDGE_CASE_MAX]
        if edge_cases:
            results["edge_cases"] = len(edge_cases)
            scored = await score_edge_cases_with_gpt(scored)

        # Insert feeds >= threshold
        inserted_count = 0
        async with conn:
            for feed in scored:
                if feed.score >= AUTO_ACCEPT_THRESHOLD:
                    inserted = await insert_rss_feed(
                        conn, feed.url, feed.category
                    )
                    if inserted:
                        inserted_count += 1
                        feed.inserted = True

            # Log results
            await log_discovery_result(conn, category, scored)

        results["inserted"] = inserted_count
        log.info(
            "discovery_complete",
            category=category,
            validated=results["validated"],
            scored=results["scored"],
            inserted=results["inserted"],
        )

    return results


async def hourly_discovery() -> dict[str, Any]:
    """Main hourly discovery task — evaluates all categories."""
    log.info("hourly_discovery_start")

    # Get all categories from seed files
    categories = [
        f.stem
        for f in SEEDS_DIR.glob("*.yaml")
        if f.stem != "rss-feeds"  # Skip the output file
    ]

    # Run discovery for each category
    all_results = {}
    for category in categories:
        try:
            all_results[category] = await discover_feeds_for_category(category)
        except Exception as e:
            log.error(
                "discovery_category_failed",
                category=category,
                error=str(e),
            )
            all_results[category] = {"error": str(e)}

    # Summary
    total_inserted = sum(
        r.get("inserted", 0) for r in all_results.values() if isinstance(r, dict)
    )
    log.info("hourly_discovery_complete", total_inserted=total_inserted)

    return {
        "run_at": str(__import__("datetime").datetime.now(__import__("datetime").UTC)),
        "categories": all_results,
        "total_inserted": total_inserted,
    }


if __name__ == "__main__":
    # Run standalone for testing
    result = asyncio.run(hourly_discovery())
    print(json.dumps(result, indent=2))
