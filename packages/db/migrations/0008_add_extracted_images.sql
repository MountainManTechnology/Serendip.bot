-- Migration: 0008_add_extracted_images.sql
-- Purpose: ensure `site_cache.extracted_images` JSONB column exists.
-- This migration is intentionally idempotent and safe to run on databases
-- that already have the column. To avoid a full-table rewrite, we add the
-- column without a default, backfill NULLs in a controlled way, then set
-- the DEFAULT for future inserts.

-- 1) Add column if missing (no default to avoid table rewrite)
ALTER TABLE "site_cache" ADD COLUMN IF NOT EXISTS "extracted_images" jsonb;
--> statement-breakpoint

-- 2) Backfill existing rows that have NULL for the column. On very large
-- tables you should backfill in batches (see docs/internal/0008_add_extracted_images.md)
UPDATE "site_cache" SET "extracted_images" = '[]'::jsonb WHERE "extracted_images" IS NULL;
--> statement-breakpoint

-- 3) Set the column default for new inserts
ALTER TABLE "site_cache" ALTER COLUMN "extracted_images" SET DEFAULT '[]'::jsonb;
--> statement-breakpoint
