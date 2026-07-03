CREATE TYPE "public"."ledger_deletion_reason" AS ENUM('user_deleted', 'superseded', 'voided');--> statement-breakpoint
CREATE TYPE "public"."source_document_status" AS ENUM('pending', 'confirmed', 'voided', 'dismissed');--> statement-breakpoint
ALTER TABLE "property_ledger" ADD COLUMN "deletion_reason" "ledger_deletion_reason";--> statement-breakpoint
ALTER TABLE "property_ledger" ADD COLUMN "superseded_by_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "status" "source_document_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "replaces_source_document_id" uuid;--> statement-breakpoint
ALTER TABLE "property_ledger" ADD CONSTRAINT "pl_superseded_by_fk" FOREIGN KEY ("superseded_by_entry_id") REFERENCES "public"."property_ledger"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "sd_replaces_fk" FOREIGN KEY ("replaces_source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" DROP CONSTRAINT "source_documents_user_id_file_hash_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_source_documents_user_hash_active" ON "source_documents" USING btree ("user_id","file_hash") WHERE "deleted_at" IS NULL;
