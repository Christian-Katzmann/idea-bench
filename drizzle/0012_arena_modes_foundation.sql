CREATE TYPE "public"."campaign_kind" AS ENUM('model', 'prompt', 'system_prompt');--> statement-breakpoint
ALTER TABLE "campaign_models" ALTER COLUMN "provider_model_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_models" ADD COLUMN "kind" "campaign_kind" DEFAULT 'model' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_models" ADD COLUMN "variant_text" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "kind" "campaign_kind" DEFAULT 'model' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pinned_provider_model_id" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pinned_model_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pinned_system_prompt" text;--> statement-breakpoint
ALTER TABLE "campaign_models" ADD CONSTRAINT "campaign_models_model_shape" CHECK ("campaign_models"."kind" != 'model' OR ("campaign_models"."provider_model_id" IS NOT NULL AND "campaign_models"."variant_text" IS NULL));--> statement-breakpoint
ALTER TABLE "campaign_models" ADD CONSTRAINT "campaign_models_variant_shape" CHECK ("campaign_models"."kind" = 'model' OR ("campaign_models"."variant_text" IS NOT NULL AND "campaign_models"."provider_model_id" IS NULL));--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_pinned_model_when_kinded" CHECK ("campaigns"."kind" = 'model' OR "campaigns"."pinned_provider_model_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_no_pinned_model_when_model" CHECK ("campaigns"."kind" != 'model' OR "campaigns"."pinned_provider_model_id" IS NULL);--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_pinned_system_prompt_only_for_prompt" CHECK ("campaigns"."kind" = 'prompt' OR "campaigns"."pinned_system_prompt" IS NULL);--> statement-breakpoint
-- Plan 04 backfill: derive `pinned_model_snapshot` for existing
-- model-arena campaigns from their first contestant row so the audit
-- story is consistent across kinds. We snapshot the per-campaign
-- contestant copy (provider_model_id, display_name, params) rather
-- than the registry — for legacy rows that's the only authoritative
-- source. snapshotAt = NOW() reflects when the backfill ran (the
-- closest analogue to "launch time" available retroactively).
-- Skip rows with no derivable contestant — leaving the snapshot null
-- is acceptable; downstream readers fall back to `campaign_models`.
UPDATE "campaigns" SET "pinned_model_snapshot" = (
  SELECT jsonb_build_object(
    'providerModelId', cm."provider_model_id",
    'displayName', cm."display_name",
    'params', cm."params",
    'snapshotAt', NOW()
  )
  FROM "campaign_models" cm
  WHERE cm."campaign_id" = "campaigns"."id"
    AND cm."provider_model_id" IS NOT NULL
  ORDER BY cm."created_at" ASC
  LIMIT 1
)
WHERE "kind" = 'model' AND "pinned_model_snapshot" IS NULL;