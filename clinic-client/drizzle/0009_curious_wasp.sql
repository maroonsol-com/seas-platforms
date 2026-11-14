ALTER TYPE "public"."collection_method" ADD VALUE 'other';--> statement-breakpoint
CREATE TABLE "patient_sequences" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_sequences_last_number_nonnegative" CHECK ("patient_sequences"."last_number" >= 0)
);
--> statement-breakpoint
ALTER TABLE "patient_sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "receipt_sequences" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_sequences_last_number_nonnegative" CHECK ("receipt_sequences"."last_number" >= 0)
);
--> statement-breakpoint
ALTER TABLE "receipt_sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_otp_challenges" (
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
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"business_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "invoice_prefix" text DEFAULT 'INV' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "terms" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "currency" char(3) DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "default_due_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "logo_data_url" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "terms" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issuer_display_name" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issuer_legal_name" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issuer_address" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issuer_phone" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issuer_email" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issuer_gstin" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issuer_footer" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "patient_sequences" ADD CONSTRAINT "patient_sequences_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_otp_challenges_email_idx" ON "user_otp_challenges" USING btree ("email","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_token_hash_unique" ON "user_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_gstin" CHECK ("business_settings"."gstin" IS NULL OR char_length("business_settings"."gstin") = 15);--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_prefix" CHECK ("business_settings"."invoice_prefix" ~ '^[A-Z0-9]{1,10}$');--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_due_days" CHECK ("business_settings"."default_due_days" BETWEEN 0 AND 365);--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_currency" CHECK (char_length("business_settings"."currency") = 3);--> statement-breakpoint
CREATE POLICY "patient_sequences_business_isolation" ON "patient_sequences" AS PERMISSIVE FOR ALL TO public USING ("patient_sequences"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("patient_sequences"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "receipt_sequences_business_isolation" ON "receipt_sequences" AS PERMISSIVE FOR ALL TO public USING ("receipt_sequences"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("receipt_sequences"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "patient_sequences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receipt_sequences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "patient_sequences" TO clinic_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "receipt_sequences" TO clinic_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_otp_challenges" TO clinic_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_sessions" TO clinic_app;--> statement-breakpoint
INSERT INTO permissions (key, description) VALUES
  ('patients.read', 'View patients'),
  ('patients.write', 'Create and update patients'),
  ('products.read', 'View the product catalogue'),
  ('products.write', 'Create and update products'),
  ('services.read', 'View the service catalogue'),
  ('services.write', 'Create and update services'),
  ('invoices.read', 'View invoices'),
  ('invoices.write', 'Create, edit, finalize, and cancel invoices'),
  ('payments.read', 'View payments and receipts'),
  ('payments.write', 'Record payments, refunds, and credit notes'),
  ('reports.read', 'View invoicing reports'),
  ('settings.read', 'View clinic settings'),
  ('settings.write', 'Update clinic branding and invoice settings')
ON CONFLICT (key) DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, business_id, permission_id)
SELECT roles.id, roles.business_id, permissions.id
FROM roles
JOIN permissions ON true
WHERE roles.name = 'Owner' AND roles.is_system = true
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO business_settings (business_id, display_name, legal_name, address, phone)
SELECT businesses.id, businesses.display_name, businesses.legal_name,
  coalesce(branches.address_line1 || ', ' || branches.city || ', ' || branches.state || ' ' || branches.postal_code, 'Address pending'),
  branches.phone
FROM businesses
LEFT JOIN branches ON branches.business_id = businesses.id AND branches.code = 'MAIN'
ON CONFLICT (business_id) DO NOTHING;--> statement-breakpoint
INSERT INTO branch_memberships (membership_id, branch_id, business_id)
SELECT business_memberships.id, branches.id, business_memberships.business_id
FROM business_memberships
JOIN membership_roles ON membership_roles.membership_id = business_memberships.id
JOIN roles ON roles.id = membership_roles.role_id AND roles.name = 'Owner'
JOIN branches ON branches.business_id = business_memberships.business_id AND branches.code = 'MAIN'
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE OR REPLACE FUNCTION next_invoice_number(target_business uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_allocated integer;
  v_current_business uuid;
  v_prefix text;
BEGIN
  v_current_business := nullif(current_setting('app.current_business_id', true), '')::uuid;
  IF target_business IS DISTINCT FROM v_current_business THEN
    RAISE EXCEPTION 'invoice numbers can only be allocated for the current business'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT invoice_prefix INTO v_prefix
  FROM business_settings
  WHERE business_id = target_business;

  IF v_prefix IS NULL OR v_prefix !~ '^[A-Z0-9]{1,10}$' THEN
    v_prefix := 'INV';
  END IF;

  INSERT INTO invoice_sequences AS sequences (business_id, last_number)
  VALUES (target_business, 1)
  ON CONFLICT (business_id) DO UPDATE
    SET last_number = sequences.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO v_allocated;

  RETURN v_prefix || '-' || lpad(v_allocated::text, 6, '0');
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION next_patient_number(target_business uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_allocated integer;
  v_current_business uuid;
BEGIN
  v_current_business := nullif(current_setting('app.current_business_id', true), '')::uuid;
  IF target_business IS DISTINCT FROM v_current_business THEN
    RAISE EXCEPTION 'patient numbers can only be allocated for the current business'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO patient_sequences AS sequences (business_id, last_number)
  VALUES (target_business, 1)
  ON CONFLICT (business_id) DO UPDATE
    SET last_number = sequences.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO v_allocated;

  RETURN 'PAT-' || lpad(v_allocated::text, 6, '0');
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION next_receipt_number(target_business uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_allocated integer;
  v_current_business uuid;
BEGIN
  v_current_business := nullif(current_setting('app.current_business_id', true), '')::uuid;
  IF target_business IS DISTINCT FROM v_current_business THEN
    RAISE EXCEPTION 'receipt numbers can only be allocated for the current business'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO receipt_sequences AS sequences (business_id, last_number)
  VALUES (target_business, 1)
  ON CONFLICT (business_id) DO UPDATE
    SET last_number = sequences.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO v_allocated;

  RETURN 'RCT-' || lpad(v_allocated::text, 6, '0');
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION clinic_guard_invoice()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
    NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
    OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
    OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
    OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
    OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.discount_total IS DISTINCT FROM OLD.discount_total
    OR NEW.tax_total IS DISTINCT FROM OLD.tax_total
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.terms IS DISTINCT FROM OLD.terms
    OR NEW.issuer_display_name IS DISTINCT FROM OLD.issuer_display_name
    OR NEW.issuer_legal_name IS DISTINCT FROM OLD.issuer_legal_name
    OR NEW.issuer_address IS DISTINCT FROM OLD.issuer_address
    OR NEW.issuer_phone IS DISTINCT FROM OLD.issuer_phone
    OR NEW.issuer_email IS DISTINCT FROM OLD.issuer_email
    OR NEW.issuer_gstin IS DISTINCT FROM OLD.issuer_gstin
    OR NEW.issuer_footer IS DISTINCT FROM OLD.issuer_footer
    OR NEW.brand_color IS DISTINCT FROM OLD.brand_color
  ) THEN
    RAISE EXCEPTION 'issued invoice amounts and identity cannot be changed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION provision_clinic_business(
  p_platform_business_id uuid,
  p_legal_name text,
  p_display_name text,
  p_timezone text,
  p_owner_name text,
  p_owner_email text,
  p_owner_mobile text,
  p_address_line1 text,
  p_city text,
  p_state text,
  p_postal_code text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_clinic_id uuid;
  v_owner_id uuid;
  v_membership_id uuid;
  v_role_id uuid;
  v_address text;
BEGIN
  IF p_platform_business_id IS NULL OR length(btrim(p_owner_email)) = 0 THEN
    RAISE EXCEPTION 'provisioning requires a platform business and owner email';
  END IF;

  SELECT id INTO v_clinic_id
  FROM businesses
  WHERE platform_business_id = p_platform_business_id;

  IF v_clinic_id IS NULL THEN
    INSERT INTO businesses (platform_business_id, legal_name, display_name, status, timezone)
    VALUES (p_platform_business_id, p_legal_name, p_display_name, 'active', p_timezone)
    RETURNING id INTO v_clinic_id;
  END IF;

  SELECT id INTO v_owner_id
  FROM users
  WHERE lower(email) = lower(p_owner_email);

  IF v_owner_id IS NULL THEN
    INSERT INTO users (email, name, mobile, status)
    VALUES (p_owner_email, p_owner_name, NULLIF(p_owner_mobile, ''), 'active')
    RETURNING id INTO v_owner_id;
  END IF;

  INSERT INTO business_memberships (business_id, user_id, status)
  VALUES (v_clinic_id, v_owner_id, 'active')
  ON CONFLICT (business_id, user_id) DO UPDATE SET status = 'active'
  RETURNING id INTO v_membership_id;

  SELECT id INTO v_role_id
  FROM roles
  WHERE business_id = v_clinic_id AND name = 'Owner';

  IF v_role_id IS NULL THEN
    INSERT INTO roles (business_id, name, description, is_system)
    VALUES (v_clinic_id, 'Owner', 'Clinic owner', true)
    RETURNING id INTO v_role_id;
  END IF;

  INSERT INTO membership_roles (membership_id, role_id, business_id)
  VALUES (v_membership_id, v_role_id, v_clinic_id)
  ON CONFLICT (membership_id, role_id) DO NOTHING;

  INSERT INTO branches (business_id, name, code, address_line1, city, state, postal_code)
  SELECT v_clinic_id, 'Main', 'MAIN', p_address_line1, p_city, p_state, p_postal_code
  WHERE NOT EXISTS (
    SELECT 1 FROM branches WHERE business_id = v_clinic_id AND code = 'MAIN'
  );

  INSERT INTO permissions (key, description) VALUES
    ('patients.read', 'View patients'),
    ('patients.write', 'Create and update patients'),
    ('products.read', 'View the product catalogue'),
    ('products.write', 'Create and update products'),
    ('services.read', 'View the service catalogue'),
    ('services.write', 'Create and update services'),
    ('invoices.read', 'View invoices'),
    ('invoices.write', 'Create, edit, finalize, and cancel invoices'),
    ('payments.read', 'View payments and receipts'),
    ('payments.write', 'Record payments, refunds, and credit notes'),
    ('reports.read', 'View invoicing reports'),
    ('settings.read', 'View clinic settings'),
    ('settings.write', 'Update clinic branding and invoice settings')
  ON CONFLICT (key) DO NOTHING;

  INSERT INTO role_permissions (role_id, business_id, permission_id)
  SELECT v_role_id, v_clinic_id, permissions.id
  FROM permissions
  ON CONFLICT DO NOTHING;

  INSERT INTO branch_memberships (membership_id, branch_id, business_id)
  SELECT v_membership_id, branches.id, v_clinic_id
  FROM branches
  WHERE branches.business_id = v_clinic_id AND branches.code = 'MAIN'
  ON CONFLICT DO NOTHING;

  v_address := concat_ws(', ', p_address_line1, p_city, p_state || ' ' || p_postal_code);
  INSERT INTO business_settings (business_id, display_name, legal_name, address, phone)
  VALUES (v_clinic_id, p_display_name, p_legal_name, v_address, NULL)
  ON CONFLICT (business_id) DO NOTHING;

  INSERT INTO audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_clinic_id,
    v_owner_id,
    'business.provisioned',
    'business',
    v_clinic_id,
    jsonb_build_object('platformBusinessId', p_platform_business_id)
  );

  RETURN v_clinic_id;
END;
$$;