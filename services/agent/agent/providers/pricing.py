"""LLM provider cost table.

All prices are in USD per 1,000,000 tokens (input, output).
Ollama is self-hosted so cost is zero.
Update this table when model pricing changes — it is the single source of truth
for estimated_cost_usd in metrics.llm_cost_events.

Usage::

    from agent.providers.pricing import estimate_cost

    cost = estimate_cost(
        model="gemini-1.5-flash-8b",
        prompt_tokens=400,
        completion_tokens=150,
    )
"""

from __future__ import annotations

# (input_per_1m_usd, output_per_1m_usd)
COST_TABLE: dict[str, tuple[float, float]] = {
    # Google Gemini
    "gemini-1.5-flash-8b": (0.0375, 0.15),
    "gemini-1.5-flash": (0.075, 0.30),
    "gemini-1.5-pro": (1.25, 5.00),
    "gemini-2.0-flash": (0.10, 0.40),
    # Anthropic Claude
    "claude-haiku-3-5": (0.80, 4.00),
    "claude-haiku-3-5-20241022": (0.80, 4.00),
    "claude-sonnet-4-5": (3.00, 15.00),
    "claude-sonnet-4-5-20241022": (3.00, 15.00),
    "claude-opus-4-5": (15.00, 75.00),
    # Azure AI Foundry — price depends on the underlying model.
    # These are representative defaults; actual pricing varies by deployment.
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4-turbo": (10.00, 30.00),
    # Text embeddings (output_per_1m not applicable — use 0.0)
    "text-embedding-3-small": (0.02, 0.0),
    "text-embedding-3-large": (0.13, 0.0),
    "text-embedding-ada-002": (0.10, 0.0),
}

# Ollama and any unknown model defaults to zero cost
_ZERO: tuple[float, float] = (0.0, 0.0)


def estimate_cost(
    model: str,
    prompt_tokens: int,
    completion_tokens: int | None = None,
) -> float:
    """Return estimated USD cost for a single LLM call.

    Args:
        model: The model name exactly as returned by the provider (e.g. ``"claude-haiku-3-5"``).
        prompt_tokens: Number of input/prompt tokens consumed.
        completion_tokens: Number of output tokens generated. Pass ``None`` for
            embedding calls (no output tokens).

    Returns:
        Estimated cost in USD, rounded to 6 decimal places.
    """
    input_rate, output_rate = COST_TABLE.get(model, _ZERO)
    cost = (prompt_tokens / 1_000_000) * input_rate
    if completion_tokens:
        cost += (completion_tokens / 1_000_000) * output_rate
    return round(cost, 6)
