-- Idempotent backfill of 0007 (RLS policies) and 0008 (index rename).
-- Both were silently skipped in all environments due to non-monotonic journal timestamps.
-- Safe whether the originals ran or not.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'entities' AND policyname = 'users manage own entities'
  ) THEN
    CREATE POLICY "users manage own entities"
      ON "entities" FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'property_valuations' AND policyname = 'users manage own property valuations'
  ) THEN
    CREATE POLICY "users manage own property valuations"
      ON "property_valuations" FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'installment_loan_balances' AND policyname = 'users manage own loan balances'
  ) THEN
    CREATE POLICY "users manage own loan balances"
      ON "installment_loan_balances" FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'properties_user_id_idx'
  ) THEN
    ALTER INDEX "properties_user_id_idx" RENAME TO "idx_properties_user";
  END IF;
END $$;
