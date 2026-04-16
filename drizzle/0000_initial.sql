CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."vote_winner" AS ENUM('A', 'B', 'tie', 'both_bad');--> statement-breakpoint
CREATE TABLE "campaign_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"provider_model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"categories" text[] DEFAULT '{}' NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "campaigns_share_slug_unique" UNIQUE("share_slug")
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"campaign_model_id" uuid NOT NULL,
	"output" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"latency_ms" integer,
	"cost_usd" numeric(12, 8),
	"provider_response_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cookie_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"email" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"text" text NOT NULL,
	"context" text,
	"category_tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"campaign_model_id" uuid NOT NULL,
	"category" text DEFAULT 'overall' NOT NULL,
	"elo" integer DEFAULT 1000 NOT NULL,
	"ci_low" integer,
	"ci_high" integer,
	"game_count" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ci_computed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"generation_a_id" uuid NOT NULL,
	"generation_b_id" uuid NOT NULL,
	"pair_key" text NOT NULL,
	"winner" "vote_winner" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_models" ADD CONSTRAINT "campaign_models_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_campaign_model_id_campaign_models_id_fk" FOREIGN KEY ("campaign_model_id") REFERENCES "public"."campaign_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_campaign_model_id_campaign_models_id_fk" FOREIGN KEY ("campaign_model_id") REFERENCES "public"."campaign_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_generation_a_id_generations_id_fk" FOREIGN KEY ("generation_a_id") REFERENCES "public"."generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_generation_b_id_generations_id_fk" FOREIGN KEY ("generation_b_id") REFERENCES "public"."generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_campaign_model" ON "campaign_models" USING btree ("campaign_id","provider_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_prompt_model" ON "generations" USING btree ("prompt_id","campaign_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_cookie_campaign" ON "participants" USING btree ("cookie_id","campaign_id");--> statement-breakpoint
CREATE INDEX "prompts_campaign_order" ON "prompts" USING btree ("campaign_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_rating" ON "ratings" USING btree ("campaign_id","campaign_model_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_participant_pair" ON "votes" USING btree ("participant_id","pair_key");--> statement-breakpoint
CREATE INDEX "votes_campaign" ON "votes" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "votes_prompt" ON "votes" USING btree ("prompt_id");