# LLM Providers

How Serendip Bot routes AI tasks across multiple LLM providers with tiered fallback.

## Table of Contents

- [Overview](#overview)
- [Provider Priority](#provider-priority)
- [Task Tiers](#task-tiers)
- [Provider Configuration](#provider-configuration)
  - [Azure AI Foundry](#azure-ai-foundry)
  - [Google Gemini](#google-gemini)
  - [Anthropic Claude](#anthropic-claude)
  - [Ollama (Local)](#ollama-local)
- [Routing Logic](#routing-logic)
- [Fallback Behavior](#fallback-behavior)
- [Embeddings](#embeddings)
- [Model Overrides](#model-overrides)

---

## Overview

The discovery agent uses an `LLMRouter` class (`services/agent/agent/providers/router.py`) to dispatch AI tasks to the most appropriate provider. Tasks are categorized into tiers by complexity and cost, and providers are selected based on availability and configuration.

All providers implement a common `LLMProvider` protocol:

```python
class LLMProvider(Protocol):
    async def complete(
        self, prompt: str, system: str | None = None,
        max_tokens: int = 256, temperature: float = 0.3,
    ) -> LLMResponse: ...

    async def embed(self, text: str) -> list[float]: ...
```

---

## Provider Priority

When Azure AI Foundry is configured, it handles **all tiers** with a single deployment. Otherwise, providers are selected per-tier:

| Priority | Provider         | Env Vars Required                                        | Tiers                           |
| -------- | ---------------- | -------------------------------------------------------- | ------------------------------- |
| 1        | Azure AI Foundry | `AZURE_AI_FOUNDRY_ENDPOINT` + `AZURE_AI_FOUNDRY_API_KEY` | All                             |
| 2        | Google Gemini    | `GEMINI_API_KEY`                                         | Tier 1                          |
| 3        | Anthropic Claude | `ANTHROPIC_API_KEY`                                      | Tier 2, 3 (fallback for Tier 1) |
| 4        | Ollama           | `OLLAMA_BASE_URL` (default: localhost)                   | All (local fallback)            |

---

## Task Tiers

| Tier       | Tasks                                          | Characteristics                 | Default Model         |
| ---------- | ---------------------------------------------- | ------------------------------- | --------------------- |
| **Tier 1** | Quality evaluation, content summary, why-blurb | Cheap, fast, many calls per job | `gemini-1.5-flash-8b` |
| **Tier 2** | Profile matching                               | Mid-cost, moderate complexity   | `claude-haiku-3-5`    |
| **Tier 3** | Novel topic generation                         | High quality, fewer calls       | `claude-sonnet-4-5`   |

Task type enum (`services/agent/agent/providers/base.py`):

```python
class TaskType(str, Enum):
    QUALITY_EVAL = "quality_eval"      # Tier 1
    CONTENT_SUMMARY = "content_summary"  # Tier 1
    WHY_BLURB = "why_blurb"            # Tier 1
    PROFILE_MATCH = "profile_match"    # Tier 2
    NOVEL_TOPIC = "novel_topic"        # Tier 3
    EMBEDDING = "embedding"            # Special
```

---

## Provider Configuration

### Azure AI Foundry

When configured, takes priority across all tiers with a single deployment.

```bash
AZURE_AI_FOUNDRY_ENDPOINT="https://your-project.cognitiveservices.azure.com"
AZURE_AI_FOUNDRY_API_KEY="your-key"
AZURE_AI_FOUNDRY_DEPLOYMENT="gpt-4o"               # Chat model
AZURE_AI_FOUNDRY_EMBED_DEPLOYMENT="text-embedding-3-large"  # Optional
```

Get credentials from: [ai.azure.com](https://ai.azure.com) → Your Project → Deployments → select a deployment.

### Google Gemini

Primary provider for Tier 1 tasks (cheapest per token).

```bash
GEMINI_API_KEY="your-gemini-key"
```

### Anthropic Claude

Handles Tier 2 and Tier 3 tasks. Falls back to Tier 1 if Gemini is unavailable.

```bash
ANTHROPIC_API_KEY="your-claude-key"
```

### Ollama (Local)

No API key required — runs locally. Final fallback for all tiers.

```bash
OLLAMA_BASE_URL="http://localhost:11434"  # Default
```

Install Ollama from [ollama.com](https://ollama.com) and pull a model:

```bash
ollama pull llama3.1
```

---

## Routing Logic

```
Task submitted to LLMRouter.complete()
│
├─► Determine tier from TaskType
│   ├── QUALITY_EVAL, CONTENT_SUMMARY, WHY_BLURB → Tier 1
│   ├── PROFILE_MATCH → Tier 2
│   └── NOVEL_TOPIC → Tier 3
│
├─► Azure configured?
│   └── YES → Use Azure for all tiers (single provider)
│
├─► Tier 1?
│   ├── Gemini key? → Use Gemini
│   └── Claude key? → Use Claude (fallback)
│
├─► Tier 2 or 3?
│   └── Claude key? → Use Claude
│
└─► Final fallback → Ollama (local)
```

---

## Fallback Behavior

If a provider fails during `complete()`, the router cascades to the next tier:

- Tier 1 failure → try Tier 2 provider
- Tier 2 failure → try Tier 3 provider
- Tier 3 failure → raise exception (job moves to dead-letter queue)

**Azure does not cascade** — if Azure is configured and fails, the error is raised immediately since all tiers share the same deployment.

Fallback is logged:

```
llm_tier_failed  task=quality_eval  tier=1  error="rate limit exceeded"
llm_fallback     task=quality_eval  from_tier=1  to_tier=2
```

---

## Embeddings

Embeddings are used for `curiosity_profiles.embedding` and `site_cache.embedding` (vector(1536) columns).

The router's `embed()` method tries:

1. The Tier 1 provider's `embed()` method
2. Falls back to Gemini if the primary provider doesn't support embeddings

Azure AI Foundry supports embeddings when `AZURE_AI_FOUNDRY_EMBED_DEPLOYMENT` is set.

---

## Model Overrides

Default models can be overridden via environment variables:

```bash
LLM_TIER1_MODEL="gemini-1.5-flash-8b"   # Default Tier 1
LLM_TIER2_MODEL="claude-haiku-3-5"       # Default Tier 2
LLM_TIER3_MODEL="claude-sonnet-4-5"      # Default Tier 3
```

---

## See Also

- [Python Agent](Python-Agent.md) — How the agent uses LLM providers in the discovery pipeline
- [Self-Hosting](Self-Hosting.md) — Environment variable reference
- [Architecture](Architecture.md) — System overview showing the LLM routing flow
