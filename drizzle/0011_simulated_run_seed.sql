-- Adds a nullable `seed` text column to simulated_runs. Stores the
-- string seed threaded through sampleSeed()/coinFlip() for deterministic
-- bracket + tie-break behaviour, enabling "Replay with same seed".
-- Legacy runs keep seed=NULL (runner falls back to Math.random).

ALTER TABLE "simulated_runs" ADD COLUMN "seed" text;
