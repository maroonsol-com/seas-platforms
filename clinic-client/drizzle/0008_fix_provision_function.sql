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
