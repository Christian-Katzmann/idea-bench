ALTER TABLE "campaigns" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "campaigns_deleted_at" ON "campaigns" USING btree ("deleted_at","created_at");