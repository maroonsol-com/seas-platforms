-- The Neon application role owns these tables. Ownership bypasses RLS unless it is forced.
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branch_memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE business_memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE business_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE businesses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE consultation_amendments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE consultations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE credit_note_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE credit_notes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE diagnoses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE doctor_leave FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE doctor_profiles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE doctor_schedules FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE expense_categories FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE file_metadata FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE inventory_categories FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoice_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membership_roles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE patient_medical_records FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE prescription_medicines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE prescriptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE products FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE purchase_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE purchases FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE refunds FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE services FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE staff_profiles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE supplier_payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vitals FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Lets an authenticated member list businesses before a business context exists.
-- Writes still require app.current_business_id through businesses_tenant_isolation.
CREATE POLICY businesses_member_visibility ON businesses
AS PERMISSIVE
FOR SELECT
TO public
USING (
  id IN (
    SELECT business_id
    FROM business_memberships
    WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      AND status = 'active'
  )
);
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE appointments
ADD CONSTRAINT appointments_doctor_no_overlap
EXCLUDE USING gist (
  doctor_id WITH =,
  tstzrange(starts_at, ends_at, '[)') WITH &&
)
WHERE (status NOT IN ('cancelled', 'no_show'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION clinic_reject_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'records in % cannot be %', TG_TABLE_NAME, lower(TG_OP)
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER businesses_reject_delete BEFORE DELETE ON businesses FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER users_reject_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER patients_reject_delete BEFORE DELETE ON patients FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER patient_medical_records_reject_delete BEFORE DELETE ON patient_medical_records FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER appointments_reject_delete BEFORE DELETE ON appointments FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER consultations_reject_delete BEFORE DELETE ON consultations FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER consultation_amendments_reject_delete BEFORE DELETE ON consultation_amendments FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER consultation_amendments_reject_update BEFORE UPDATE ON consultation_amendments FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER vitals_reject_delete BEFORE DELETE ON vitals FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER vitals_reject_update BEFORE UPDATE ON vitals FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER diagnoses_reject_delete BEFORE DELETE ON diagnoses FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER diagnoses_reject_update BEFORE UPDATE ON diagnoses FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER prescriptions_reject_delete BEFORE DELETE ON prescriptions FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER invoices_reject_delete BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER payments_reject_delete BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER refunds_reject_delete BEFORE DELETE ON refunds FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER credit_notes_reject_delete BEFORE DELETE ON credit_notes FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER credit_note_items_reject_delete BEFORE DELETE ON credit_note_items FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER stock_movements_reject_delete BEFORE DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER stock_movements_reject_update BEFORE UPDATE ON stock_movements FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER purchases_reject_delete BEFORE DELETE ON purchases FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER supplier_payments_reject_delete BEFORE DELETE ON supplier_payments FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER expenses_reject_delete BEFORE DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER audit_logs_reject_delete BEFORE DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE TRIGGER audit_logs_reject_update BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION clinic_guard_finalized_consultation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'a finalized consultation cannot be changed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER consultations_finalized_guard
BEFORE UPDATE ON consultations
FOR EACH ROW EXECUTE FUNCTION clinic_guard_finalized_consultation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION clinic_guard_finalized_prescription()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'a finalized prescription cannot be changed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER prescriptions_finalized_guard
BEFORE UPDATE ON prescriptions
FOR EACH ROW EXECUTE FUNCTION clinic_guard_finalized_prescription();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION clinic_guard_finalized_prescription_child()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status prescription_status;
BEGIN
  SELECT status INTO parent_status
  FROM prescriptions
  WHERE id = OLD.prescription_id;

  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'medicines on a finalized prescription cannot be changed'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER prescription_medicines_finalized_guard
BEFORE UPDATE OR DELETE ON prescription_medicines
FOR EACH ROW EXECUTE FUNCTION clinic_guard_finalized_prescription_child();
--> statement-breakpoint
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
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.discount_total IS DISTINCT FROM OLD.discount_total
    OR NEW.tax_total IS DISTINCT FROM OLD.tax_total
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.issued_on IS DISTINCT FROM OLD.issued_on
  ) THEN
    RAISE EXCEPTION 'issued invoice amounts and identity cannot be changed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoices_issued_guard
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION clinic_guard_invoice();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION clinic_guard_invoice_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status invoice_status;
  parent_invoice uuid;
BEGIN
  parent_invoice := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;

  SELECT status INTO parent_status
  FROM invoices
  WHERE id = parent_invoice;

  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'items on an issued invoice cannot be changed'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_items_issued_guard
BEFORE UPDATE OR DELETE ON invoice_items
FOR EACH ROW EXECUTE FUNCTION clinic_guard_invoice_item();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION clinic_guard_purchase_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status purchase_status;
  parent_purchase uuid;
BEGIN
  parent_purchase := CASE WHEN TG_OP = 'DELETE' THEN OLD.purchase_id ELSE NEW.purchase_id END;

  SELECT status INTO parent_status
  FROM purchases
  WHERE id = parent_purchase;

  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'items on a submitted purchase cannot be changed'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER purchase_items_submitted_guard
BEFORE UPDATE OR DELETE ON purchase_items
FOR EACH ROW EXECUTE FUNCTION clinic_guard_purchase_item();
