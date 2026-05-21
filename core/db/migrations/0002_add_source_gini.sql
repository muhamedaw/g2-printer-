-- Add source column to trades (tracks which strategy triggered the trade)
ALTER TABLE "trades" ADD COLUMN IF NOT EXISTS "source" varchar(20);

-- Add gini_coefficient to safety_checks
ALTER TABLE "safety_checks" ADD COLUMN IF NOT EXISTS "gini_coefficient" numeric(6, 4);

-- Index for fast strategy-based queries
CREATE INDEX IF NOT EXISTS "trades_source_idx" ON "trades" USING btree ("source");
