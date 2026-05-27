CREATE TABLE "loan_staging_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"line_item_index" integer NOT NULL,
	"payment_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"interest_cents" integer,
	"principal_cents" integer,
	"description" text,
	"confidence" text NOT NULL,
	"installment_loan_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loan_staging_items_source_document_id_line_item_index_unique" UNIQUE("source_document_id","line_item_index")
);
--> statement-breakpoint
ALTER TABLE "loan_staging_items" ADD CONSTRAINT "lsi_source_doc_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "loan_staging_items" ADD CONSTRAINT "lsi_installment_loan_fk" FOREIGN KEY ("installment_loan_id") REFERENCES "public"."installment_loans"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "loan_staging_items" ADD CONSTRAINT "lsi_confidence_check" CHECK ("confidence" IN ('high', 'medium', 'low'));
--> statement-breakpoint
ALTER TABLE "loan_staging_items" ADD CONSTRAINT "lsi_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'));
--> statement-breakpoint
CREATE INDEX "idx_loan_staging_user" ON "loan_staging_items" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_loan_staging_loan" ON "loan_staging_items" USING btree ("installment_loan_id");
--> statement-breakpoint
ALTER TABLE "loan_staging_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "users manage own loan_staging_items"
  ON "loan_staging_items" FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
