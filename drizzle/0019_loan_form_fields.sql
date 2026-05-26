ALTER TYPE "public"."loan_type" ADD VALUE 'line_of_credit';--> statement-breakpoint
CREATE TYPE "public"."rate_type" AS ENUM('variable', 'fixed');--> statement-breakpoint
ALTER TABLE "installment_loans" ADD COLUMN "account_reference" text;--> statement-breakpoint
ALTER TABLE "installment_loans" ADD COLUMN "loan_term_years" integer;--> statement-breakpoint
ALTER TABLE "installment_loans" ADD COLUMN "rate_type" "rate_type";--> statement-breakpoint
ALTER TABLE "installment_loans" ADD COLUMN "original_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "installment_loans" ALTER COLUMN "start_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "installment_loans" ALTER COLUMN "end_date" DROP NOT NULL;
