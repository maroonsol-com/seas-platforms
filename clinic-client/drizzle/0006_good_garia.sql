CREATE TABLE "subscription_snapshots" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"plan_name" text NOT NULL,
	"starts_on" date NOT NULL,
	"expires_on" date NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_snapshots" ADD CONSTRAINT "subscription_snapshots_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "subscription_snapshots_business_isolation" ON "subscription_snapshots" AS PERMISSIVE FOR ALL TO public USING ("subscription_snapshots"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("subscription_snapshots"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);