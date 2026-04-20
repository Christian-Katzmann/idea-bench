CREATE TYPE "public"."voting_mode" AS ENUM('anonymous', 'email_required', 'hybrid');--> statement-breakpoint
-- Existing rows pre-date this feature and previously accepted email as
-- optional (email + "Start voting" with blank input allowed). Backfill
-- them to 'hybrid' so their UX doesn't silently change. Future inserts
-- use 'anonymous' as the default (see ALTER COLUMN ... SET DEFAULT below).
ALTER TABLE "campaigns" ADD COLUMN "voting_mode" "voting_mode" DEFAULT 'hybrid' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "voting_mode" SET DEFAULT 'anonymous';--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "email_prompt_message" text;
