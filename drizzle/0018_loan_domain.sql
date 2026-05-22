CREATE TYPE "public"."loan_type" AS ENUM('interest_only', 'principal_and_interest');--> statement-breakpoint
ALTER TABLE "installment_loans" ADD COLUMN "loan_type" "loan_type";--> statement-breakpoint
ALTER TABLE "installment_loans" ADD COLUMN "io_end_date" date;--> statement-breakpoint
ALTER TABLE "installment_loans" ADD COLUMN "interest_rate" numeric(5, 2);--> statement-breakpoint
CREATE TABLE "loan_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"installment_loan_id" uuid NOT NULL,
	"payment_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"interest_cents" integer,
	"principal_cents" integer,
	"description" text,
	"source_document_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loan_ledger" ADD CONSTRAINT "loan_ledger_installment_loan_id_installment_loans_id_fk" FOREIGN KEY ("installment_loan_id") REFERENCES "public"."installment_loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_ledger" ADD CONSTRAINT "loan_ledger_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_loan_ledger_loan_date" ON "loan_ledger" USING btree ("installment_loan_id","payment_date");--> statement-breakpoint
CREATE INDEX "idx_loan_ledger_user" ON "loan_ledger" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "loan_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users manage own loan_ledger"
  ON "loan_ledger" FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
