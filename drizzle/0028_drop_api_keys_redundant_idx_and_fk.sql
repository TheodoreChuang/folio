-- idx_api_keys_hash is superseded by the UNIQUE constraint on key_hash (api_keys_key_hash_unique),
-- which already creates an implicit btree index. Having both wastes write overhead.
DROP INDEX IF EXISTS "idx_api_keys_hash";
--> statement-breakpoint
-- api_keys_user_id_fkey (to auth.users) is not representable in Drizzle schema (cross-schema FK).
-- Dropping aligns the DB with schema.ts, consistent with all other user-scoped tables.
-- User isolation is enforced at the application layer via WHERE user_id = ? in all queries.
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_user_id_fkey";
