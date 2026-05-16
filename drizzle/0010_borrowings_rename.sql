-- Phase 2: Rename Borrowings tables and columns.
-- loan_accounts → installment_loans
-- loan_balances → installment_loan_balances
-- column loan_account_id → installment_loan_id in both tables and property_ledger
-- installment_loans.property_id: drop NOT NULL, change FK to ON DELETE SET NULL

-- ── Table renames ──────────────────────────────────────────────────────────────

ALTER TABLE "loan_accounts" RENAME TO "installment_loans";--> statement-breakpoint
ALTER TABLE "loan_balances" RENAME TO "installment_loan_balances";--> statement-breakpoint

-- ── Column renames ─────────────────────────────────────────────────────────────

ALTER TABLE "installment_loan_balances" RENAME COLUMN "loan_account_id" TO "installment_loan_id";--> statement-breakpoint
ALTER TABLE "property_ledger" RENAME COLUMN "loan_account_id" TO "installment_loan_id";--> statement-breakpoint

-- ── property_id: drop NOT NULL + swap FK to SET NULL ──────────────────────────

ALTER TABLE "installment_loans"
  DROP CONSTRAINT "loan_accounts_property_id_properties_id_fk";--> statement-breakpoint
ALTER TABLE "installment_loans"
  ALTER COLUMN "property_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "installment_loans"
  ADD CONSTRAINT "installment_loans_property_id_properties_id_fk"
  FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- ── FK renames (cosmetic — old names followed the table rename automatically) ──

ALTER TABLE "installment_loans"
  RENAME CONSTRAINT "loan_accounts_entity_id_entities_id_fk"
  TO "installment_loans_entity_id_entities_id_fk";--> statement-breakpoint
ALTER TABLE "installment_loan_balances"
  RENAME CONSTRAINT "loan_balances_loan_account_id_loan_accounts_id_fk"
  TO "installment_loan_balances_installment_loan_id_installment_loans_id_fk";--> statement-breakpoint
ALTER TABLE "property_ledger"
  RENAME CONSTRAINT "property_ledger_entries_loan_account_id_loan_accounts_id_fk"
  TO "property_ledger_installment_loan_id_installment_loans_id_fk";--> statement-breakpoint

-- ── Unique constraint rename ───────────────────────────────────────────────────

ALTER TABLE "installment_loan_balances"
  RENAME CONSTRAINT "loan_balances_loan_account_id_recorded_at_unique"
  TO "installment_loan_balances_installment_loan_id_recorded_at_unique";--> statement-breakpoint

-- ── Index renames ──────────────────────────────────────────────────────────────

ALTER INDEX "idx_loan_accounts_user"     RENAME TO "idx_installment_loans_user";--> statement-breakpoint
ALTER INDEX "idx_loan_accounts_property" RENAME TO "idx_installment_loans_property";--> statement-breakpoint
ALTER INDEX "idx_loan_balances_loan_date" RENAME TO "idx_installment_loan_balances_loan_date";--> statement-breakpoint

-- ── RLS policy renames ─────────────────────────────────────────────────────────

ALTER POLICY "users manage own loan accounts" ON "installment_loans"
  RENAME TO "users manage own installment loans";--> statement-breakpoint
ALTER POLICY "users manage own loan balances" ON "installment_loan_balances"
  RENAME TO "users manage own installment loan balances";
