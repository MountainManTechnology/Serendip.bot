#!/usr/bin/env python3
"""Offline grid search for optimal rerank weights.

Usage:
    python -m scripts.train_rerank_weights [--grid-points N] [--output-env PATH]

Evaluates rerank weight combinations against historical discovery data,
using `site_cache.popularity` as a proxy for engagement (higher popularity =
more served and presumably clicked).

Output:
    - Prints best weights to stdout
    - Optionally writes .env fragment to --output-env path
"""

from __future__ import annotations

import argparse
import asyncio
import itertools
import json
import sys
from pathlib import Path
from typing import Any

# Allow running as a script from the services/agent directory
sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg

from agent.config import settings
from agent.serving import cosine_similarity

# ── Data loading ──────────────────────────────────────────────────────────────


async def load_training_data(dsn: str, limit: int = 2000) -> list[dict[str, Any]]:
    """Load recent discovery session data with site embeddings and popularity signals."""
    conn = await psycopg.AsyncConnection.connect(dsn, row_factory=psycopg.rows.dict_row)
    async with conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                WITH session_sites AS (
                    SELECT
                        ds.id AS session_id,
                        ds.mood,
                        ds.topics,
                        d.site_cache_id,
                        sc.embedding,
                        sc.categories,
                        sc.quality_score,
                        sc.popularity,
                        sc.ingested_at,
                        sc.last_shown_at,
                        d.rank_position
                    FROM discovery_sessions ds
                    JOIN discoveries d ON d.session_id = ds.id
                    JOIN site_cache sc ON sc.id = d.site_cache_id
                    WHERE sc.embedding IS NOT NULL
                      AND ds.created_at > NOW() - INTERVAL '30 days'
                    ORDER BY ds.created_at DESC
                    LIMIT %(limit)s
                ),
                mood_embeddings AS (
                    SELECT id AS mood_id, embedding AS mood_embedding
                    FROM moods
                )
                SELECT
                    ss.*,
                    me.mood_embedding
                FROM session_sites ss
                LEFT JOIN mood_embeddings me ON me.mood_id = ss.mood
                """,
                {"limit": limit},
            )
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


def _parse_vec(v: Any) -> list[float] | None:
    if v is None:
        return None
    if isinstance(v, list):
        return v
    try:
        return list(map(float, str(v).strip("[]").split(",")))
    except (ValueError, AttributeError):
        return None


def _jaccard(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


# ── Scoring ───────────────────────────────────────────────────────────────────


def score_site(
    row: dict[str, Any],
    weights: dict[str, float],
) -> float:
    """Compute rerank score for a site given a weight configuration."""
    site_emb = _parse_vec(row.get("embedding"))
    mood_emb = _parse_vec(row.get("mood_embedding"))
    topics = row.get("topics") or []
    categories = row.get("categories") or []
    ingested_at = row.get("ingested_at")
    popularity = int(row.get("popularity") or 0)
    last_shown_at = row.get("last_shown_at")

    mood_sim = cosine_similarity(site_emb or [], mood_emb or []) if (site_emb and mood_emb) else 0.0
    topic_overlap = _jaccard(topics, categories) if topics else 0.0

    import math
    from datetime import UTC, datetime

    def recency_boost(ts: Any) -> float:
        if not ts:
            return 0.0
        if hasattr(ts, "replace"):
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)
            age = (datetime.now(UTC) - ts).days
            return max(0.0, 1.0 - age / 90.0)
        return 0.0

    def pop_penalty(p: int) -> float:
        if p <= 2:
            return 0.0
        return min(0.2, 0.07 * math.log2(p))

    def stale_penalty(ts: Any) -> float:
        if not ts:
            return 0.0
        if hasattr(ts, "replace"):
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)
            age = (datetime.now(UTC) - ts).days
            return max(0.0, 0.2 - age * 0.02)
        return 0.0

    return (
        weights["mood"] * mood_sim
        + weights["topic"] * topic_overlap
        + weights["recency"] * recency_boost(ingested_at)
        - 0.10 * pop_penalty(popularity)
        - 0.05 * stale_penalty(last_shown_at)
    )


# ── Evaluation ────────────────────────────────────────────────────────────────


def evaluate_weights(
    rows: list[dict[str, Any]],
    weights: dict[str, float],
) -> float:
    """Score a weight config using Spearman rank correlation with popularity.

    Higher popularity (served more = implicit positive signal) should correlate
    with higher rerank score for a good weight config.
    Returns correlation coefficient in [-1, 1]; higher is better.
    """
    if len(rows) < 10:
        return 0.0

    model_scores = []
    popularity_ranks = []
    for row in rows:
        s = score_site(row, weights)
        p = int(row.get("popularity") or 0)
        model_scores.append(s)
        popularity_ranks.append(p)

    # Spearman correlation (rank-based)
    n = len(model_scores)
    score_ranks = [sorted(model_scores, reverse=True).index(s) for s in model_scores]
    pop_ranks = [sorted(popularity_ranks, reverse=True).index(p) for p in popularity_ranks]
    d_sq = sum((sr - pr) ** 2 for sr, pr in zip(score_ranks, pop_ranks))
    return 1.0 - (6 * d_sq) / (n * (n**2 - 1))


# ── Grid search ───────────────────────────────────────────────────────────────


def grid_search(
    rows: list[dict[str, Any]],
    grid_points: int = 5,
) -> tuple[dict[str, float], float]:
    """Exhaustive grid search over weight combinations. Returns best weights + score."""
    # Candidate values for each weight (must sum to ≤ 1.0)
    step = 1.0 / (grid_points - 1) if grid_points > 1 else 0.5
    values = [round(i * step, 2) for i in range(grid_points)]

    best_weights: dict[str, float] = {"mood": 0.50, "topic": 0.15, "recency": 0.05}
    best_score = -999.0
    n_evaluated = 0

    for mood_w, topic_w, recency_w in itertools.product(values, repeat=3):
        if mood_w + topic_w + recency_w > 1.0:
            continue  # Invalid — sum exceeds budget
        w = {"mood": mood_w, "topic": topic_w, "recency": recency_w}
        score = evaluate_weights(rows, w)
        n_evaluated += 1
        if score > best_score:
            best_score = score
            best_weights = w

    print(f"Grid search: evaluated {n_evaluated} weight combinations", file=sys.stderr)
    return best_weights, best_score


# ── Main ──────────────────────────────────────────────────────────────────────


async def main(grid_points: int, output_env: str | None) -> None:
    dsn = settings.database_url
    print("Loading training data from database...", file=sys.stderr)

    rows = await load_training_data(dsn, limit=5000)
    if len(rows) < 50:
        print(
            f"WARNING: Only {len(rows)} training rows found. "
            "Run the system for a few days to collect more data.",
            file=sys.stderr,
        )
        if len(rows) < 10:
            print("Not enough data to train. Exiting.", file=sys.stderr)
            sys.exit(1)

    print(
        f"Loaded {len(rows)} rows. Running grid search (grid_points={grid_points})...",
        file=sys.stderr,
    )
    best_weights, best_score = grid_search(rows, grid_points=grid_points)

    print("\n=== Best Rerank Weights ===")
    print(f"Spearman correlation: {best_score:.4f}")
    print(json.dumps(best_weights, indent=2))

    env_fragment = (
        f"\n# Rerank weights (from train_rerank_weights.py, score={best_score:.4f})\n"
        f"RERANK_MOOD_WEIGHT={best_weights['mood']}\n"
        f"RERANK_TOPIC_WEIGHT={best_weights['topic']}\n"
        f"RERANK_RECENCY_WEIGHT={best_weights['recency']}\n"
    )
    print("\n=== .env fragment ===")
    print(env_fragment)

    if output_env:
        Path(output_env).write_text(env_fragment)
        print(f"Written to {output_env}", file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--grid-points", type=int, default=5, help="Points per axis in grid")
    parser.add_argument("--output-env", help="Path to write .env fragment with best weights")
    args = parser.parse_args()
    asyncio.run(main(args.grid_points, args.output_env))
