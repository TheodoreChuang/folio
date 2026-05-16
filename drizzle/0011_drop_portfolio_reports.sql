-- Phase 3: Drop portfolio_reports table.
-- Monthly report cadence removed; AI commentary feature-flagged off permanently.
-- No financial data was stored in this table (only aiCommentary text + metadata).

DROP INDEX IF EXISTS "idx_reports_user_month";--> statement-breakpoint
DROP TABLE IF EXISTS "portfolio_reports";
