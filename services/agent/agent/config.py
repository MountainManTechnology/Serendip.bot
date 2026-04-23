from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = Field(default="", description="PostgreSQL connection string")

    # Redis / Queue
    redis_url: str = Field(default="redis://localhost:6379", description="Redis connection string")
    celery_broker_url: str = Field(
        default="", description="Celery broker URL (default: redis_url/1)"
    )
    celery_result_backend: str = Field(
        default="", description="Celery result backend URL (default: redis_url/2)"
    )
    internal_api_token: str = Field(
        default="", description="Shared secret for Node→Agent HTTP auth"
    )

    # AI Providers
    gemini_api_key: str = Field(default="", description="Google Gemini API key")
    anthropic_api_key: str = Field(default="", description="Anthropic API key")
    openai_api_key: str = Field(default="", description="OpenAI API key (optional)")
    ollama_base_url: str = Field(
        default="http://localhost:11434", description="Ollama base URL for self-hosters"
    )

    # Azure AI Foundry (preferred provider when configured)
    # Get from: https://ai.azure.com → Your Project → Deployments → select a deployment
    azure_ai_foundry_endpoint: str = Field(default="", description="Azure AI Foundry endpoint URL")
    azure_ai_foundry_api_key: str = Field(default="", description="Azure AI Foundry API key")
    azure_ai_foundry_deployment: str = Field(
        default="", description="Chat model deployment name (e.g. gpt-4o)"
    )
    azure_ai_foundry_embed_deployment: str = Field(
        default="", description="Embedding model deployment name (e.g. text-embedding-3-large)"
    )
    azure_ai_foundry_embed_endpoint: str = Field(
        default="", description="Separate Azure endpoint for embeddings (e.g. https://resource.services.ai.azure.com). Falls back to azure_ai_foundry_endpoint if not set."
    )

    # Azure Computer Vision (OCR)
    azure_computer_vision_endpoint: str = Field(
        default="", description="Azure Computer Vision endpoint (e.g. https://<resource>.cognitiveservices.azure.com)"
    )
    azure_computer_vision_key: str = Field(
        default="", description="Azure Computer Vision subscription key"
    )

    # Optional image embedding deployment (Azure Foundry) — if set, may be used
    # in future for true image-model embeddings. Currently a textual fallback
    # (alt + caption + OCR) is used when a dedicated image embed model is not
    # available.
    azure_image_embed_deployment: str = Field(
        default="", description="Optional Azure Foundry deployment name for image embeddings"
    )
    azure_image_embed_endpoint: str = Field(
        default="", description="Optional endpoint to use for image embeddings if different from Foundry endpoint"
    )

    # LLM routing overrides (optional — override default tier selection)
    llm_tier1_model: str = Field(default="gemini-1.5-flash-8b", description="Cheap/fast model")
    llm_tier2_model: str = Field(default="claude-haiku-3-5", description="Mid-tier model")
    llm_tier3_model: str = Field(default="claude-sonnet-4-5", description="High-quality model")

    # Crawler
    crawler_max_concurrency: int = Field(default=20, description="Max concurrent HTTP requests")
    crawler_timeout_seconds: int = Field(default=10, description="Per-URL fetch timeout")
    crawler_rate_limit_per_domain: float = Field(
        default=1.0, description="Max requests/sec per domain"
    )

    # Discovery
    discovery_min_quality_score: float = Field(
        default=0.3, description="Minimum quality score to include in results"
    )
    discovery_result_count: int = Field(default=3, description="Target number of results")
    discovery_surprise_factor: float = Field(
        default=0.25, description="Fraction of results that should be outside known preferences"
    )
    max_results_per_domain: int = Field(
        default=2, description="Maximum results from the same domain per stumble batch"
    )
    discovery_use_pool: bool = Field(
        default=False, description="Use precomputed pool serving path (ADR-002 Phase 3)"
    )
    discovery_log_pool_shadow: bool = Field(
        default=False, description="Shadow-log pool path results even when pool is disabled"
    )

    # Rerank weights (serving plane) — tunable via env vars
    rerank_mood_weight: float = Field(default=0.50, description="Weight for mood cosine similarity")
    rerank_profile_weight: float = Field(
        default=0.30, description="Weight for profile cosine similarity"
    )
    rerank_topic_weight: float = Field(default=0.15, description="Weight for topic Jaccard overlap")
    rerank_recency_weight: float = Field(default=0.05, description="Weight for recency boost")

    # Observability
    sentry_dsn: str = Field(default="", description="Sentry DSN (optional)")
    log_level: str = Field(default="INFO")

    # Ingest pipeline: concurrency for crawl + quality LLM evals
    eval_concurrency: int = Field(
        default=6, description="Concurrency for crawl + quality-eval LLM calls"
    )

    # Image-first pipeline toggles and thresholds
    enable_photo_pipeline: bool = Field(
        default=False, description="Enable image-first photography ingestion pipeline"
    )
    photo_min_images: int = Field(
        default=1, description="Minimum number of images to accept photography content"
    )
    photo_min_alt_length: int = Field(
        default=5, description="Minimum alt/caption length to accept image-only pages"
    )
    photo_max_words: int = Field(
        default=120, description="Maximum word count for an item to be considered image-first"
    )

    enable_comic_pipeline: bool = Field(
        default=False, description="Enable comic ingestion pipeline"
    )
    comic_min_panels: int = Field(
        default=2, description="Minimum number of image panels to accept comic content"
    )


settings = Settings()
