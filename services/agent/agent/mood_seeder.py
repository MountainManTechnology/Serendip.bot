"""Mood seeder — populates the `moods` table with reference embeddings.

Run once (idempotent) before enabling DISCOVERY_USE_POOL:
    python -m agent.mood_seeder

Each mood gets:
  - A curated seed_prompt describing the emotional state + content type
  - An embedding generated from that prompt via the configured LLM router
  - Initial category_priors from the static _MOOD_CATEGORY_MAP (tuned later by retune_moods)
"""

from __future__ import annotations

import asyncio
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from agent.config import settings
from agent.db import get_connection
from agent.logging import log
from agent.providers.router import router as llm_router

# Seed prompts — descriptive text that captures each mood's emotional tone and content fit.
# These are embedded once; the resulting vector becomes the mood's reference embedding.
_MOOD_SEED_PROMPTS: dict[str, dict[str, Any]] = {
    "wonder": {
        "display_name": "Wonder",
        "seed_prompt": (
            "A sense of awe and deep curiosity about the universe — science discoveries, natural "
            "phenomena, philosophical questions, and historical mysteries. Content that makes you "
            "say 'I never knew that' or stare in amazement at how strange and beautiful the world "
            "is. Thought-provoking essays, cosmology, evolution, ancient history, and the edges of "
            "human knowledge."
        ),
        "category_priors": {"science": 0.9, "nature": 0.8, "philosophy": 0.7, "history": 0.7},
    },
    "learn": {
        "display_name": "Learn",
        "seed_prompt": (
            "Focused intellectual learning and deep understanding — rigorous explainers on "
            "science, technology, history, and philosophy. Tutorials, academic writing made "
            "accessible, and "
            "essays that build genuine knowledge rather than just surface familiarity. Content for "
            "curious people who want to actually understand how things work."
        ),
        "category_priors": {
            "science": 0.9,
            "technology": 0.8,
            "history": 0.75,
            "philosophy": 0.7,
        },
    },
    "create": {
        "display_name": "Create",
        "seed_prompt": (
            "Creative inspiration for making things — design, art, technology projects, crafts, "
            "and cultural criticism. Content that sparks ideas and makes you want to build, draw, "
            "write, code, or experiment. Behind-the-scenes of creative processes, design thinking, "
            "and how makers bring ideas into the world."
        ),
        "category_priors": {"design": 0.9, "culture": 0.75, "technology": 0.7, "art": 0.8},
    },
    "explore": {
        "display_name": "Explore",
        "seed_prompt": (
            "Adventure and curiosity about the physical world — travel, nature, culture, and "
            "history from places and times you have never encountered. Stories from the edges of "
            "the map, dispatches from remote communities, hidden histories of familiar places, "
            "and the wonders of the natural world waiting to be discovered."
        ),
        "category_priors": {
            "travel": 0.9,
            "nature": 0.8,
            "culture": 0.75,
            "history": 0.7,
        },
    },
    "laugh": {
        "display_name": "Laugh",
        "seed_prompt": (
            "Finding humor and lightness in the world — sharp satire, absurdist comedy, witty "
            "cultural commentary, and the genuinely funny side of internet culture and gaming. "
            "Content that makes you actually laugh out loud or snort unexpectedly. Smart humor "
            "that respects your intelligence while making you smile."
        ),
        "category_priors": {"humor": 0.95, "culture": 0.65, "gaming": 0.6},
    },
    "relax": {
        "display_name": "Relax",
        "seed_prompt": (
            "Peaceful, low-stakes reading and gentle discovery — beautiful nature photography and "
            "writing, food culture and recipes, pleasant travel stories, and comfortable cultural "
            "pieces without urgency or anxiety. Content that feels like a slow Sunday morning: "
            "absorbing, pleasant, and easy to put down and pick back up."
        ),
        "category_priors": {"nature": 0.85, "food": 0.85, "travel": 0.75, "culture": 0.65},
    },
    "inspire": {
        "display_name": "Inspire",
        "seed_prompt": (
            "Motivation, big ideas, and human achievement — cultural criticism that reframes how "
            "you see the world, philosophy that clarifies what matters, science stories of "
            "breakthroughs and persistence, and design that shows what humans can create. "
            "Content that makes you want to be better, think differently, or start something new."
        ),
        "category_priors": {
            "culture": 0.8,
            "philosophy": 0.8,
            "science": 0.7,
            "design": 0.75,
        },
    },
    "challenge": {
        "display_name": "Challenge",
        "seed_prompt": (
            "Intellectual challenge and hard problems — rigorous science, dense philosophy, and "
            "technology that pushes your thinking to its limits. Long-form essays that require "
            "full attention, mathematical ideas explained carefully, and arguments that force you "
            "to grapple with ideas you have never fully examined. "
            "For when you want to be stretched."
        ),
        "category_priors": {"science": 0.9, "philosophy": 0.85, "technology": 0.75},
    },
}


async def seed_moods(conn: psycopg.AsyncConnection[Any]) -> int:
    """Insert or update all moods with fresh embeddings. Returns count of rows upserted."""
    upserted = 0

    for mood_id, mood_data in _MOOD_SEED_PROMPTS.items():
        log.info("seeding_mood", mood_id=mood_id)

        # Generate embedding from the seed prompt
        try:
            embedding: list[float] = await llm_router.embed(mood_data["seed_prompt"])
        except Exception as exc:
            log.error("mood_embed_failed", mood_id=mood_id, error=str(exc))
            raise

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
                    "id": mood_id,
                    "display_name": mood_data["display_name"],
                    "seed_prompt": mood_data["seed_prompt"],
                    "embedding": str(embedding).replace(" ", ""),
                    "category_priors": Jsonb(mood_data["category_priors"]),
                },
            )
            upserted += 1

        await conn.commit()
        log.info("mood_seeded", mood_id=mood_id)

    return upserted


async def _run() -> None:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured")

    conn = await get_connection()
    async with conn:
        count = await seed_moods(conn)
    log.info("mood_seeding_complete", total=count)


if __name__ == "__main__":
    asyncio.run(_run())
