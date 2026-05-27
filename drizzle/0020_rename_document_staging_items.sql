-- Rename document_staging_items to property_staging_items
ALTER TABLE "document_staging_items" RENAME TO "property_staging_items";
--> statement-breakpoint
-- Rename auto-generated unique constraint (not renamed by Postgres on table rename)
ALTER TABLE "property_staging_items"
  RENAME CONSTRAINT "document_staging_items_source_document_id_line_item_index_unique"
  TO "property_staging_items_source_document_id_line_item_index_unique";
--> statement-breakpoint
-- Rename RLS policy (no ALTER POLICY RENAME in Postgres — must drop + recreate)
DROP POLICY "users manage own document_staging_items" ON "property_staging_items";
--> statement-breakpoint
CREATE POLICY "users manage own property_staging_items"
  ON "property_staging_items" FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
