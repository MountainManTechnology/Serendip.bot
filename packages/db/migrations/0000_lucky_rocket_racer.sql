CREATE TABLE "curiosity_profiles" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"session_id" uuid,
	"user_id" uuid,
	"topic_weights" jsonb DEFAULT '{}'::jsonb,
	"mood_history" jsonb DEFAULT '[]'::jsonb,
	"embedding" vector(1536),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discoveries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"discovery_session_id" uuid,
	"site_cache_id" uuid,
	"why_blurb" text,
	"position" integer,
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"session_id" uuid,
	"mood" text,
	"topics" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"session_id" uuid,
	"site_cache_id" uuid,
	"signal" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_cache" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"title" text,
	"description" text,
	"content_summary" text,
	"content_html" text,
	"extracted_images" jsonb DEFAULT '[]'::jsonb,
	"quality_score" real,
	"categories" jsonb DEFAULT '[]'::jsonb,
	"embedding" vector(1536),
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_cache_url_unique" UNIQUE("url"),
	CONSTRAINT "site_cache_url_hash_unique" UNIQUE("url_hash")
);
--> statement-breakpoint
ALTER TABLE "curiosity_profiles" ADD CONSTRAINT "curiosity_profiles_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_discovery_session_id_discovery_sessions_id_fk" FOREIGN KEY ("discovery_session_id") REFERENCES "public"."discovery_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_site_cache_id_site_cache_id_fk" FOREIGN KEY ("site_cache_id") REFERENCES "public"."site_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_sessions" ADD CONSTRAINT "discovery_sessions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_site_cache_id_site_cache_id_fk" FOREIGN KEY ("site_cache_id") REFERENCES "public"."site_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_discoveries_session" ON "discoveries" USING btree ("discovery_session_id");--> statement-breakpoint
CREATE INDEX "idx_feedback_session" ON "feedback" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_site_cache_url_hash" ON "site_cache" USING btree ("url_hash");