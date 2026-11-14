-- Narrow provisioning function. It is the only path that creates a clinic
-- business before a tenant context exists. It runs as the table owner so it
-- can look up an existing platform business id, then creates the business,
-- owner, membership, and main branch once. Callers must authenticate the
-- request before executing it. Row level security on ordinary tables is
-- unchanged.

ALTER TABLE "subscription_snapshots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "subscription_snapshots" TO clinic_app;
--> statement-breakpoint
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
  clinic_id uuid;
  owner_id uuid;
  membership_id uuid;
  role_id uuid;
BEGIN
  IF p_platform_business_id IS NULL OR length(btrim(p_owner_email)) = 0 THEN
    RAISE EXCEPTION 'provisioning requires a platform business and owner email';
  END IF;

  SELECT id INTO clinic_id
  FROM businesses
  WHERE platform_business_id = p_platform_business_id;

  IF clinic_id IS NULL THEN
    INSERT INTO businesses (platform_business_id, legal_name, display_name, status, timezone)
    VALUES (p_platform_business_id, p_legal_name, p_display_name, 'active', p_timezone)
    RETURNING id INTO clinic_id;
  END IF;

  SELECT id INTO owner_id
  FROM users
  WHERE lower(email) = lower(p_owner_email);

  IF owner_id IS NULL THEN
    INSERT INTO users (email, name, mobile, status)
    VALUES (p_owner_email, p_owner_name, NULLIF(p_owner_mobile, ''), 'active')
    RETURNING id INTO owner_id;
  END IF;

  INSERT INTO business_memberships (business_id, user_id, status)
  VALUES (clinic_id, owner_id, 'active')
  ON CONFLICT (business_id, user_id) DO UPDATE SET status = 'active'
  RETURNING id INTO membership_id;

  SELECT id INTO role_id
  FROM roles
  WHERE business_id = clinic_id AND name = 'Owner';

  IF role_id IS NULL THEN
    INSERT INTO roles (business_id, name, description, is_system)
    VALUES (clinic_id, 'Owner', 'Clinic owner', true)
    RETURNING id INTO role_id;
  END IF;

  INSERT INTO membership_roles (membership_id, role_id, business_id)
  VALUES (membership_id, role_id, clinic_id)
  ON CONFLICT (membership_id, role_id) DO NOTHING;

  INSERT INTO branches (business_id, name, code, address_line1, city, state, postal_code)
  SELECT clinic_id, 'Main', 'MAIN', p_address_line1, p_city, p_state, p_postal_code
  WHERE NOT EXISTS (
    SELECT 1 FROM branches WHERE business_id = clinic_id AND code = 'MAIN'
  );

  INSERT INTO audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    clinic_id,
    owner_id,
    'business.provisioned',
    'business',
    clinic_id,
    jsonb_build_object('platformBusinessId', p_platform_business_id)
  );

  RETURN clinic_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION provision_clinic_business(
  uuid, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION provision_clinic_business(
  uuid, text, text, text, text, text, text, text, text, text, text
) TO clinic_app;
