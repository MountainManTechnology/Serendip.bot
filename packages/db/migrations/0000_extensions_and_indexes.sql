-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- IVFFlat vector index on curiosity_profiles.
-- (The equivalent site_cache index was replaced by HNSW in 0003_discovery_pipeline_refactor.sql)
CREATE INDEX IF NOT EXISTS idx_curiosity_embedding
  ON curiosity_profiles USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
