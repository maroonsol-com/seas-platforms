ALTER TABLE "invoices" ADD COLUMN "issuer_logo_data_url" text;--> statement-breakpoint
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
    OR NEW.issuer_logo_data_url IS DISTINCT FROM OLD.issuer_logo_data_url
    OR NEW.brand_color IS DISTINCT FROM OLD.brand_color
  ) THEN
    RAISE EXCEPTION 'issued invoice amounts and identity cannot be changed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;