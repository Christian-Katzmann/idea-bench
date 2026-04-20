CREATE TYPE "public"."prompt_mode" AS ENUM('tournament', 'slider', 'approve_reject', 'best_of_n', 'multi_axis', 'qualitative');--> statement-breakpoint
CREATE TABLE "approve_reject_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"campaign_model_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"approved" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "best_of_n_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"chosen_campaign_model_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "multi_axis_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"campaign_model_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"scores" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualitative_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"campaign_model_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slider_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"campaign_model_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "mode" "prompt_mode" DEFAULT 'tournament' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "mode_config" jsonb;--> statement-breakpoint
ALTER TABLE "approve_reject_responses" ADD CONSTRAINT "approve_reject_responses_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approve_reject_responses" ADD CONSTRAINT "approve_reject_responses_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approve_reject_responses" ADD CONSTRAINT "approve_reject_responses_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approve_reject_responses" ADD CONSTRAINT "approve_reject_responses_campaign_model_id_campaign_models_id_fk" FOREIGN KEY ("campaign_model_id") REFERENCES "public"."campaign_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_of_n_responses" ADD CONSTRAINT "best_of_n_responses_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_of_n_responses" ADD CONSTRAINT "best_of_n_responses_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_of_n_responses" ADD CONSTRAINT "best_of_n_responses_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_of_n_responses" ADD CONSTRAINT "best_of_n_responses_chosen_campaign_model_id_campaign_models_id_fk" FOREIGN KEY ("chosen_campaign_model_id") REFERENCES "public"."campaign_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multi_axis_responses" ADD CONSTRAINT "multi_axis_responses_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multi_axis_responses" ADD CONSTRAINT "multi_axis_responses_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multi_axis_responses" ADD CONSTRAINT "multi_axis_responses_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multi_axis_responses" ADD CONSTRAINT "multi_axis_responses_campaign_model_id_campaign_models_id_fk" FOREIGN KEY ("campaign_model_id") REFERENCES "public"."campaign_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD CONSTRAINT "qualitative_responses_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD CONSTRAINT "qualitative_responses_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD CONSTRAINT "qualitative_responses_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD CONSTRAINT "qualitative_responses_campaign_model_id_campaign_models_id_fk" FOREIGN KEY ("campaign_model_id") REFERENCES "public"."campaign_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slider_responses" ADD CONSTRAINT "slider_responses_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slider_responses" ADD CONSTRAINT "slider_responses_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slider_responses" ADD CONSTRAINT "slider_responses_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slider_responses" ADD CONSTRAINT "slider_responses_campaign_model_id_campaign_models_id_fk" FOREIGN KEY ("campaign_model_id") REFERENCES "public"."campaign_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_approve_reject_response" ON "approve_reject_responses" USING btree ("participant_id","prompt_id","campaign_model_id");--> statement-breakpoint
CREATE INDEX "approve_reject_responses_campaign" ON "approve_reject_responses" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "approve_reject_responses_prompt" ON "approve_reject_responses" USING btree ("prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_best_of_n_response" ON "best_of_n_responses" USING btree ("participant_id","prompt_id");--> statement-breakpoint
CREATE INDEX "best_of_n_responses_campaign" ON "best_of_n_responses" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "best_of_n_responses_prompt" ON "best_of_n_responses" USING btree ("prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_multi_axis_response" ON "multi_axis_responses" USING btree ("participant_id","prompt_id","campaign_model_id");--> statement-breakpoint
CREATE INDEX "multi_axis_responses_campaign" ON "multi_axis_responses" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "multi_axis_responses_prompt" ON "multi_axis_responses" USING btree ("prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_qualitative_response" ON "qualitative_responses" USING btree ("participant_id","prompt_id","campaign_model_id");--> statement-breakpoint
CREATE INDEX "qualitative_responses_campaign" ON "qualitative_responses" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "qualitative_responses_prompt" ON "qualitative_responses" USING btree ("prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_slider_response" ON "slider_responses" USING btree ("participant_id","prompt_id","campaign_model_id");--> statement-breakpoint
CREATE INDEX "slider_responses_campaign" ON "slider_responses" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "slider_responses_prompt" ON "slider_responses" USING btree ("prompt_id");