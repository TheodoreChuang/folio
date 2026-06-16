CREATE TABLE "investor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"investment_goal" varchar(200),
	"strategy_notes" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investor_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "assistant_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"usage_date" date NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_usage_user_id_usage_date_unique" UNIQUE("user_id","usage_date")
);
--> statement-breakpoint
CREATE INDEX "idx_investor_profiles_user" ON "investor_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_assistant_usage_user" ON "assistant_usage" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "investor_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assistant_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users manage own investor_profiles"
  ON "public"."investor_profiles" FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "users manage own assistant_usage"
  ON "public"."assistant_usage" FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
