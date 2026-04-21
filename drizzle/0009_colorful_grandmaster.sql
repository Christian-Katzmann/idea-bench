DROP INDEX "uniq_tournament_participant_prompt";--> statement-breakpoint
ALTER TABLE "tournaments" ALTER COLUMN "participant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "simulated_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_simulated_participant_id_simulated_participants_id_fk" FOREIGN KEY ("simulated_participant_id") REFERENCES "public"."simulated_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_tournament_simulated_prompt" ON "tournaments" USING btree ("simulated_participant_id","prompt_id") WHERE "tournaments"."simulated_participant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_tournament_participant_prompt" ON "tournaments" USING btree ("participant_id","prompt_id") WHERE "tournaments"."participant_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_voter_xor" CHECK (("tournaments"."participant_id" IS NULL) <> ("tournaments"."simulated_participant_id" IS NULL));