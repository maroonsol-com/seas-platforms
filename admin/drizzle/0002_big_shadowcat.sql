ALTER TYPE "public"."billing_cycle" ADD VALUE 'half_yearly' BEFORE 'yearly';--> statement-breakpoint
CREATE TABLE "administrator_otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "administrator_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"administrator_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_provisioning" ADD COLUMN "requested_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "business_provisioning" ADD COLUMN "requested_starts_on" date;--> statement-breakpoint
ALTER TABLE "business_provisioning" ADD COLUMN "requested_expires_on" date;--> statement-breakpoint
ALTER TABLE "platform_administrators" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "platform_administrators" ADD COLUMN "mobile" text;--> statement-breakpoint
ALTER TABLE "platform_administrators" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "platform_administrators" ADD COLUMN "profile_image_url" text;--> statement-breakpoint
ALTER TABLE "platform_administrators" ADD COLUMN "timezone" text DEFAULT 'Asia/Kolkata' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_administrators" ADD COLUMN "locale" text DEFAULT 'en-IN' NOT NULL;--> statement-breakpoint
ALTER TABLE "administrator_sessions" ADD CONSTRAINT "administrator_sessions_administrator_id_platform_administrators_id_fk" FOREIGN KEY ("administrator_id") REFERENCES "public"."platform_administrators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "administrator_otp_challenges_email_idx" ON "administrator_otp_challenges" USING btree ("email","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "administrator_sessions_token_hash_unique" ON "administrator_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "administrator_sessions_administrator_idx" ON "administrator_sessions" USING btree ("administrator_id");--> statement-breakpoint
ALTER TABLE "business_provisioning" ADD CONSTRAINT "business_provisioning_requested_plan_id_subscription_plans_id_fk" FOREIGN KEY ("requested_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;