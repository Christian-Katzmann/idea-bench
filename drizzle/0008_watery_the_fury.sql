CREATE TYPE "public"."panel_type" AS ENUM('generic', 'persona');--> statement-breakpoint
CREATE TYPE "public"."rating_source" AS ENUM('human', 'simulated', 'both');--> statement-breakpoint
CREATE TYPE "public"."simulated_participant_status" AS ENUM('pending', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."simulated_run_status" AS ENUM('pending', 'running', 'complete', 'failed', 'aborted');--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"system_prompt" text NOT NULL,
	"priorities" text[] DEFAULT '{}' NOT NULL,
	"anti_patterns" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"is_starter" boolean DEFAULT false NOT NULL,
	"derived_from_persona_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulated_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"simulated_run_id" uuid NOT NULL,
	"persona_id" uuid,
	"judge_model_id" text NOT NULL,
	"seat_index" integer NOT NULL,
	"status" "simulated_participant_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "simulated_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"panel_type" "panel_type" NOT NULL,
	"voter_count" integer NOT NULL,
	"model_mix" jsonb NOT NULL,
	"persona_ids" uuid[],
	"status" "simulated_run_status" DEFAULT 'pending' NOT NULL,
	"cost_estimate_usd" numeric(10, 4),
	"cost_actual_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"cost_ceiling_usd" numeric(10, 4),
	"max_concurrency" integer DEFAULT 5 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "uniq_approve_reject_response";--> statement-breakpoint
DROP INDEX "uniq_best_of_n_response";--> statement-breakpoint
DROP INDEX "uniq_multi_axis_response";--> statement-breakpoint
DROP INDEX "uniq_qualitative_response";--> statement-breakpoint
DROP INDEX "uniq_rating";--> statement-breakpoint
DROP INDEX "uniq_slider_response";--> statement-breakpoint
ALTER TABLE "approve_reject_responses" ALTER COLUMN "participant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "best_of_n_responses" ALTER COLUMN "participant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "multi_axis_responses" ALTER COLUMN "participant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "qualitative_responses" ALTER COLUMN "participant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "slider_responses" ALTER COLUMN "participant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ALTER COLUMN "participant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approve_reject_responses" ADD COLUMN "simulated_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "best_of_n_responses" ADD COLUMN "simulated_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "multi_axis_responses" ADD COLUMN "simulated_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD COLUMN "simulated_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "source" "rating_source" DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "slider_responses" ADD COLUMN "simulated_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "simulated_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "simulated_participants" ADD CONSTRAINT "simulated_participants_simulated_run_id_simulated_runs_id_fk" FOREIGN KEY ("simulated_run_id") REFERENCES "public"."simulated_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_participants" ADD CONSTRAINT "simulated_participants_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_runs" ADD CONSTRAINT "simulated_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personas_is_starter" ON "personas" USING btree ("is_starter");--> statement-breakpoint
CREATE INDEX "personas_created_at" ON "personas" USING btree ("created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_simulated_seat" ON "simulated_participants" USING btree ("simulated_run_id","seat_index");--> statement-breakpoint
CREATE INDEX "simulated_participants_run" ON "simulated_participants" USING btree ("simulated_run_id");--> statement-breakpoint
CREATE INDEX "simulated_participants_status" ON "simulated_participants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "simulated_runs_campaign" ON "simulated_runs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "simulated_runs_status" ON "simulated_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "simulated_runs_created_at" ON "simulated_runs" USING btree ("created_at" desc);--> statement-breakpoint
ALTER TABLE "approve_reject_responses" ADD CONSTRAINT "approve_reject_responses_simulated_participant_id_simulated_participants_id_fk" FOREIGN KEY ("simulated_participant_id") REFERENCES "public"."simulated_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_of_n_responses" ADD CONSTRAINT "best_of_n_responses_simulated_participant_id_simulated_participants_id_fk" FOREIGN KEY ("simulated_participant_id") REFERENCES "public"."simulated_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multi_axis_responses" ADD CONSTRAINT "multi_axis_responses_simulated_participant_id_simulated_participants_id_fk" FOREIGN KEY ("simulated_participant_id") REFERENCES "public"."simulated_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD CONSTRAINT "qualitative_responses_simulated_participant_id_simulated_participants_id_fk" FOREIGN KEY ("simulated_participant_id") REFERENCES "public"."simulated_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slider_responses" ADD CONSTRAINT "slider_responses_simulated_participant_id_simulated_participants_id_fk" FOREIGN KEY ("simulated_participant_id") REFERENCES "public"."simulated_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_simulated_participant_id_simulated_participants_id_fk" FOREIGN KEY ("simulated_participant_id") REFERENCES "public"."simulated_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_approve_reject_response_simulated" ON "approve_reject_responses" USING btree ("simulated_participant_id","prompt_id","campaign_model_id") WHERE "approve_reject_responses"."simulated_participant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_best_of_n_response_simulated" ON "best_of_n_responses" USING btree ("simulated_participant_id","prompt_id") WHERE "best_of_n_responses"."simulated_participant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_multi_axis_response_simulated" ON "multi_axis_responses" USING btree ("simulated_participant_id","prompt_id","campaign_model_id") WHERE "multi_axis_responses"."simulated_participant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_qualitative_response_simulated" ON "qualitative_responses" USING btree ("simulated_participant_id","prompt_id","campaign_model_id") WHERE "qualitative_responses"."simulated_participant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_slider_response_simulated" ON "slider_responses" USING btree ("simulated_participant_id","prompt_id","campaign_model_id") WHERE "slider_responses"."simulated_participant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "votes_simulated_participant" ON "votes" USING btree ("simulated_participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_approve_reject_response" ON "approve_reject_responses" USING btree ("participant_id","prompt_id","campaign_model_id") WHERE "approve_reject_responses"."participant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_best_of_n_response" ON "best_of_n_responses" USING btree ("participant_id","prompt_id") WHERE "best_of_n_responses"."participant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_multi_axis_response" ON "multi_axis_responses" USING btree ("participant_id","prompt_id","campaign_model_id") WHERE "multi_axis_responses"."participant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_qualitative_response" ON "qualitative_responses" USING btree ("participant_id","prompt_id","campaign_model_id") WHERE "qualitative_responses"."participant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_rating" ON "ratings" USING btree ("campaign_id","campaign_model_id","category","source");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_slider_response" ON "slider_responses" USING btree ("participant_id","prompt_id","campaign_model_id") WHERE "slider_responses"."participant_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "approve_reject_responses" ADD CONSTRAINT "approve_reject_voter_xor" CHECK (("approve_reject_responses"."participant_id" IS NULL) <> ("approve_reject_responses"."simulated_participant_id" IS NULL));--> statement-breakpoint
ALTER TABLE "best_of_n_responses" ADD CONSTRAINT "best_of_n_voter_xor" CHECK (("best_of_n_responses"."participant_id" IS NULL) <> ("best_of_n_responses"."simulated_participant_id" IS NULL));--> statement-breakpoint
ALTER TABLE "multi_axis_responses" ADD CONSTRAINT "multi_axis_voter_xor" CHECK (("multi_axis_responses"."participant_id" IS NULL) <> ("multi_axis_responses"."simulated_participant_id" IS NULL));--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD CONSTRAINT "qualitative_voter_xor" CHECK (("qualitative_responses"."participant_id" IS NULL) <> ("qualitative_responses"."simulated_participant_id" IS NULL));--> statement-breakpoint
ALTER TABLE "slider_responses" ADD CONSTRAINT "slider_responses_voter_xor" CHECK (("slider_responses"."participant_id" IS NULL) <> ("slider_responses"."simulated_participant_id" IS NULL));--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_voter_xor" CHECK (("votes"."participant_id" IS NULL) <> ("votes"."simulated_participant_id" IS NULL));