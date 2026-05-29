CREATE TYPE "public"."budget_item_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."budget_item_frequency" AS ENUM('weekly', 'fortnightly', 'monthly', 'annual');--> statement-breakpoint
CREATE TABLE "personal_budget_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "budget_item_type" NOT NULL,
	"name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"frequency" "budget_item_frequency" NOT NULL,
	"effective_from" date NOT NULL,
	"category" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_personal_budget_items_user" ON "personal_budget_items" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "personal_budget_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users manage own personal_budget_items"
  ON "personal_budget_items" FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
