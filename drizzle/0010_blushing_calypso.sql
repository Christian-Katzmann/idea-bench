DROP INDEX "uniq_rating";--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "persona_id" uuid;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_rating_persona" ON "ratings" USING btree ("campaign_id","campaign_model_id","category","source","persona_id") WHERE "ratings"."persona_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ratings_persona" ON "ratings" USING btree ("persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_rating" ON "ratings" USING btree ("campaign_id","campaign_model_id","category","source") WHERE "ratings"."persona_id" IS NULL;