CREATE TYPE "public"."administrator_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'quarterly', 'yearly', 'custom');--> statement-breakpoint
CREATE TYPE "public"."manual_payment_method" AS ENUM('bank_transfer', 'upi', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."manual_payment_status" AS ENUM('recorded', 'received', 'voided');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."platform_business_status" AS ENUM('provisioning_pending', 'active', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."provisioning_status" AS ENUM('pending', 'in_progress', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subscription_event_type" AS ENUM('assigned', 'plan_changed', 'renewed', 'extended', 'activated', 'suspended', 'reactivated', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'expiring_soon', 'expired', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TABLE "administrative_activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_administrator_id" uuid,
	"summary" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_provisioning" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "provisioning_status" DEFAULT 'pending' NOT NULL,
	"product_business_id" uuid,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_attempted_at" timestamp with time zone,
	"succeeded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" NOT NULL,
	"starts_on" date NOT NULL,
	"expires_on" date NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_subscriptions_dates" CHECK ("business_subscriptions"."expires_on" >= "business_subscriptions"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"business_type" text NOT NULL,
	"owner_name" text NOT NULL,
	"owner_email" text NOT NULL,
	"owner_mobile" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text DEFAULT 'IN' NOT NULL,
	"gstin" text,
	"status" "platform_business_status" DEFAULT 'provisioning_pending' NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_gstin_length" CHECK ("businesses"."gstin" IS NULL OR char_length("businesses"."gstin") = 15)
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"subscription_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"payment_date" date NOT NULL,
	"method" "manual_payment_method" NOT NULL,
	"transaction_reference" text,
	"remarks" text,
	"status" "manual_payment_status" DEFAULT 'recorded' NOT NULL,
	"idempotency_key" text NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_payments_amount_positive" CHECK ("manual_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "plan_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"limit_value" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_administrator_roles" (
	"administrator_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_administrator_roles_administrator_id_role_id_pk" PRIMARY KEY("administrator_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "platform_administrators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"status" "administrator_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_administrator_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"business_id" uuid,
	"product_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "platform_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"available_features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_integration_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"provisioning_url" text,
	"entitlement_url" text,
	"secret_env_var" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_integration_secret_env_var_name" CHECK ("product_integration_configs"."secret_env_var" IS NULL OR "product_integration_configs"."secret_env_var" ~ '^[A-Z][A-Z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "saas_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"product_url" text,
	"status" "product_status" DEFAULT 'inactive' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"event_type" "subscription_event_type" NOT NULL,
	"from_status" "subscription_status",
	"to_status" "subscription_status" NOT NULL,
	"from_plan_id" uuid,
	"to_plan_id" uuid,
	"previous_expires_on" date,
	"new_expires_on" date,
	"actor_administrator_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"billing_cycle" "billing_cycle" NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"grace_days" integer DEFAULT 0 NOT NULL,
	"max_users" integer,
	"max_branches" integer,
	"storage_limit_mb" integer,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_price_nonnegative" CHECK ("subscription_plans"."price" >= 0),
	CONSTRAINT "subscription_plans_trial_nonnegative" CHECK ("subscription_plans"."trial_days" >= 0),
	CONSTRAINT "subscription_plans_grace_nonnegative" CHECK ("subscription_plans"."grace_days" >= 0),
	CONSTRAINT "subscription_plans_limits_nonnegative" CHECK (
    ("subscription_plans"."max_users" IS NULL OR "subscription_plans"."max_users" >= 0)
    AND ("subscription_plans"."max_branches" IS NULL OR "subscription_plans"."max_branches" >= 0)
    AND ("subscription_plans"."storage_limit_mb" IS NULL OR "subscription_plans"."storage_limit_mb" >= 0)
  )
);
--> statement-breakpoint
ALTER TABLE "administrative_activity_logs" ADD CONSTRAINT "administrative_activity_logs_actor_administrator_id_platform_administrators_id_fk" FOREIGN KEY ("actor_administrator_id") REFERENCES "public"."platform_administrators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_products" ADD CONSTRAINT "business_products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_products" ADD CONSTRAINT "business_products_product_id_saas_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."saas_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_provisioning" ADD CONSTRAINT "business_provisioning_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_provisioning" ADD CONSTRAINT "business_provisioning_product_id_saas_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."saas_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_subscriptions" ADD CONSTRAINT "business_subscriptions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_subscriptions" ADD CONSTRAINT "business_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_product_id_saas_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."saas_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_subscription_id_business_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."business_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_recorded_by_platform_administrators_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."platform_administrators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_administrator_roles" ADD CONSTRAINT "platform_administrator_roles_administrator_id_platform_administrators_id_fk" FOREIGN KEY ("administrator_id") REFERENCES "public"."platform_administrators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_administrator_roles" ADD CONSTRAINT "platform_administrator_roles_role_id_platform_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."platform_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_administrator_roles" ADD CONSTRAINT "platform_administrator_roles_assigned_by_platform_administrators_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."platform_administrators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_actor_administrator_id_platform_administrators_id_fk" FOREIGN KEY ("actor_administrator_id") REFERENCES "public"."platform_administrators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_product_id_saas_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."saas_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "platform_role_permissions_role_id_platform_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."platform_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "platform_role_permissions_permission_id_platform_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."platform_permissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_configurations" ADD CONSTRAINT "product_configurations_product_id_saas_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."saas_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_integration_configs" ADD CONSTRAINT "product_integration_configs_product_id_saas_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."saas_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_business_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."business_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_from_plan_id_subscription_plans_id_fk" FOREIGN KEY ("from_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_to_plan_id_subscription_plans_id_fk" FOREIGN KEY ("to_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_actor_administrator_id_platform_administrators_id_fk" FOREIGN KEY ("actor_administrator_id") REFERENCES "public"."platform_administrators"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_product_id_saas_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."saas_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "administrative_activity_logs_created_idx" ON "administrative_activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "business_products_business_unique" ON "business_products" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "business_products_product_idx" ON "business_products" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_provisioning_business_unique" ON "business_provisioning" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_provisioning_idempotency_unique" ON "business_provisioning" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "business_provisioning_status_idx" ON "business_provisioning" USING btree ("status");--> statement-breakpoint
CREATE INDEX "business_subscriptions_business_idx" ON "business_subscriptions" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "business_subscriptions_expiry_idx" ON "business_subscriptions" USING btree ("expires_on");--> statement-breakpoint
CREATE INDEX "business_subscriptions_status_idx" ON "business_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "business_subscriptions_one_open" ON "business_subscriptions" USING btree ("business_id") WHERE "business_subscriptions"."status" IN ('trial', 'active', 'expiring_soon', 'suspended');--> statement-breakpoint
CREATE INDEX "businesses_status_idx" ON "businesses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "businesses_owner_email_idx" ON "businesses" USING btree ("owner_email");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_unique" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_business_idx" ON "invitations" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "manual_payments_idempotency_unique" ON "manual_payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "manual_payments_business_idx" ON "manual_payments" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "manual_payments_subscription_idx" ON "manual_payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_features_plan_key_unique" ON "plan_features" USING btree ("plan_id","feature_key");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_administrators_email_unique" ON "platform_administrators" USING btree ("email");--> statement-breakpoint
CREATE INDEX "platform_administrators_status_idx" ON "platform_administrators" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_audit_logs_created_idx" ON "platform_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "platform_audit_logs_entity_idx" ON "platform_audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "platform_audit_logs_actor_idx" ON "platform_audit_logs" USING btree ("actor_administrator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_permissions_key_unique" ON "platform_permissions" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_roles_name_unique" ON "platform_roles" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "product_configurations_product_unique" ON "product_configurations" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_integration_configs_product_unique" ON "product_integration_configs" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_products_slug_unique" ON "saas_products" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_products_name_unique" ON "saas_products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "subscription_events_subscription_idx" ON "subscription_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_events_business_idx" ON "subscription_events" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_product_name_unique" ON "subscription_plans" USING btree ("product_id","name");--> statement-breakpoint
CREATE INDEX "subscription_plans_product_idx" ON "subscription_plans" USING btree ("product_id");