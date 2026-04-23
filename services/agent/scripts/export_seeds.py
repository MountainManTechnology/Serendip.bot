#!/usr/bin/env python3
"""Export curated site_cache rows back to seed files or a bootstrap snapshot.

Two modes:

  YAML mode (default)
    Queries ready site_cache rows and merges them back into the per-category
    YAML seed files in services/agent/agent/seeds/.  Useful for version-
    controlling newly discovered quality URLs so self-hosters start with a
    richer seed pool after a git clone.

  Snapshot mode (--snapshot)
    Writes a gzipped SQL INSERT file containing the top N site_cache rows
    (with pre-computed embeddings and mood affinities).  A fresh install can
    load this with `psql < bootstrap-snapshot.sql` to skip the first round of
    ingestion entirely.

Usage:
    # From the services/agent/ directory with the venv active:
    python -m scripts.export_seeds
    python -m scripts.export_seeds --min-score 0.70 --limit 5000
    python -m scripts.export_seeds --snapshot --limit 500
    python -m scripts.export_seeds --snapshot --limit 500 --min-score 0.70

Release workflow:
    python -m scripts.export_seeds --min-score 0.70 --limit 5000
    python -m scripts.export_seeds --snapshot
    git add services/agent/agent/seeds/
    git commit -m "chore: refresh seed pool snapshot"
"""

from __future__ import annotations

import argparse
import asyncio
import gzip
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import yaml  # type: ignore[import-untyped]

SEEDS_DIR = Path(__file__).parent.parent / "agent" / "seeds"
SNAPSHOT_PATH = SEEDS_DIR / "bootstrap-snapshot.sql.gz"
SNAPSHOT_META_PATH = SEEDS_DIR / "bootstrap-snapshot-meta.json"

# All known category values — must match YAML filenames
KNOWN_CATEGORIES = {
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


# ─── DB query helpers ────────────────────────────────────────────────────────


async def _fetch_ready_sites(
    min_score: float,
    limit: int,
) -> list[dict]:
    """Return ready site_cache rows ordered by quality_score DESC."""
    import psycopg
    from psycopg.rows import dict_row

    # Import settings from within the package
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from agent.config import settings  # noqa: PLC0415

    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set")

    conn = await psycopg.AsyncConnection.connect(settings.database_url, row_factory=dict_row)
    async with conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT
                    url, url_hash, title, description, content_summary,
                    quality_score, categories, mood_affinities, language,
                    content_type, ingested_at, embedding::text AS embedding_text
                FROM site_cache
                WHERE status = 'ready'
                  AND quality_score >= %(min_score)s
                ORDER BY quality_score DESC, popularity DESC
                LIMIT %(limit)s
                """,
                {"min_score": min_score, "limit": limit},
            )
            return [dict(r) for r in await cur.fetchall()]


# ─── YAML export ────────────────────────────────────────────────────────────


def _primary_category(categories: list[str] | str | None) -> str:
    """Return the first matching known category, or 'general'."""
    if not categories:
        return "general"
    if isinstance(categories, str):
        try:
            categories = json.loads(categories)
        except Exception:
            return "general"
    for cat in categories:
        if isinstance(cat, str) and cat.lower() in KNOWN_CATEGORIES:
            return cat.lower()
    return "general"


def _load_yaml_file(path: Path) -> dict:
    if path.exists():
        return yaml.safe_load(path.read_text()) or {}
    return {}


def _save_yaml_file(path: Path, data: dict) -> None:
    path.write_text(yaml.dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False))


def export_yaml(sites: list[dict]) -> dict[str, int]:
    """Merge site URLs into per-category YAML files. Returns {category: added_count}."""
    # Group incoming URLs by category
    buckets: dict[str, list[str]] = {}
    for site in sites:
        cats = site.get("categories")
        if isinstance(cats, str):
            try:
                cats = json.loads(cats)
            except Exception:
                cats = []
        cat = _primary_category(cats)
        buckets.setdefault(cat, []).append(site["url"])

    added: dict[str, int] = {}
    for category, new_urls in buckets.items():
        yaml_path = SEEDS_DIR / f"{category}.yaml"
        data = _load_yaml_file(yaml_path)

        existing_urls: list[str] = data.get("urls", [])
        existing_set = set(existing_urls)

        to_add = [u for u in new_urls if u not in existing_set]
        if not to_add:
            added[category] = 0
            continue

        data["topic"] = data.get("topic", category)
        data["description"] = data.get("description", f"Curated {category} content")
        data["urls"] = existing_urls + to_add

        _save_yaml_file(yaml_path, data)
        added[category] = len(to_add)
        print(f"  {yaml_path.name}: +{len(to_add)} URLs ({len(data['urls'])} total)")

    return added


# ─── Snapshot export ─────────────────────────────────────────────────────────


def _sql_literal(v: object) -> str:
    """Produce a SQL-safe literal for a Python value."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        escaped = json.dumps(v).replace("'", "''")
        return f"'{escaped}'"
    escaped = str(v).replace("'", "''")
    return f"'{escaped}'"


def export_snapshot(sites: list[dict]) -> None:
    """Write a gzipped SQL INSERT file to SNAPSHOT_PATH."""
    lines: list[str] = [
        "-- SerendipBot bootstrap snapshot",
        f"-- Generated: {datetime.now(UTC).isoformat()}",
        f"-- Rows: {len(sites)}",
        "-- Load with: psql $DATABASE_URL < bootstrap-snapshot.sql",
        "-- (decompress first: gunzip bootstrap-snapshot.sql.gz)",
        "",
        "BEGIN;",
        "",
    ]

    score_min = min(s["quality_score"] for s in sites) if sites else 0.0
    score_max = max(s["quality_score"] for s in sites) if sites else 0.0
    categories_seen: set[str] = set()

    for site in sites:
        cats = site.get("categories")
        if isinstance(cats, str):
            try:
                cats = json.loads(cats)
            except Exception:
                cats = []
        if isinstance(cats, list):
            for c in cats:
                if isinstance(c, str):
                    categories_seen.add(c)

        # Embedding column: already a text string like '[0.1,0.2,...]' from the query
        embedding_sql = "NULL"
        emb = site.get("embedding_text")
        if emb:
            escaped = str(emb).replace("'", "''")
            embedding_sql = f"'{escaped}'::vector"

        mood_aff = site.get("mood_affinities") or {}
        if isinstance(mood_aff, str):
            try:
                mood_aff = json.loads(mood_aff)
            except Exception:
                mood_aff = {}

        lines.append(
            "INSERT INTO site_cache "
            "(url, url_hash, title, description, content_summary, quality_score, "
            "categories, mood_affinities, language, content_type, embedding, status, ingested_at)"
            " VALUES ("
            f"{_sql_literal(site['url'])}, "
            f"{_sql_literal(site['url_hash'])}, "
            f"{_sql_literal(site.get('title', ''))}, "
            f"{_sql_literal(site.get('description', ''))}, "
            f"{_sql_literal(site.get('content_summary', ''))}, "
            f"{_sql_literal(site.get('quality_score', 0.0))}, "
            f"{_sql_literal(cats or [])}::jsonb, "
            f"{_sql_literal(mood_aff)}::jsonb, "
            f"{_sql_literal(site.get('language', 'en'))}, "
            f"{_sql_literal(site.get('content_type', 'article'))}, "
            f"{embedding_sql}, "
            "'ready', "
            f"{_sql_literal(str(site.get('ingested_at', 'NOW()')))}::timestamptz"
            ") ON CONFLICT (url_hash) DO NOTHING;"
        )

    lines += ["", "COMMIT;", ""]
    sql_bytes = "\n".join(lines).encode()

    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(SNAPSHOT_PATH, "wb") as f:
        f.write(sql_bytes)

    meta = {
        "generated_at": datetime.now(UTC).isoformat(),
        "row_count": len(sites),
        "score_range": {"min": round(score_min, 4), "max": round(score_max, 4)},
        "categories": sorted(categories_seen),
    }
    SNAPSHOT_META_PATH.write_text(json.dumps(meta, indent=2))

    size_kb = SNAPSHOT_PATH.stat().st_size // 1024
    print(f"  Snapshot: {SNAPSHOT_PATH} ({size_kb} KB compressed, {len(sites)} rows)")
    print(f"  Metadata: {SNAPSHOT_META_PATH}")


# ─── CLI ────────────────────────────────────────────────────────────────────


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--min-score",
        type=float,
        default=0.65,
        metavar="FLOAT",
        help="Minimum quality_score to include (default: 0.65)",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=2000,
        metavar="N",
        help="Max rows to export (default: 2000)",
    )
    p.add_argument(
        "--snapshot",
        action="store_true",
        help="Write a gzipped SQL bootstrap snapshot instead of updating YAML files",
    )
    return p.parse_args()


async def _main() -> None:
    args = _parse_args()

    print(f"Fetching site_cache rows (min_score={args.min_score}, limit={args.limit}) …")
    sites = await _fetch_ready_sites(args.min_score, args.limit)
    print(f"Found {len(sites)} rows.")

    if not sites:
        print("Nothing to export.")
        return

    if args.snapshot:
        print("Writing snapshot …")
        export_snapshot(sites)
    else:
        print("Merging into YAML seed files …")
        added = export_yaml(sites)
        total = sum(added.values())
        print(f"Done. {total} new URLs added across {len(added)} category files.")


if __name__ == "__main__":
    asyncio.run(_main())
