-- The applied guard referred to issued_on. The invoice date column is invoice_date.
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
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.discount_total IS DISTINCT FROM OLD.discount_total
    OR NEW.tax_total IS DISTINCT FROM OLD.tax_total
    OR NEW.total IS DISTINCT FROM OLD.total
  ) THEN
    RAISE EXCEPTION 'issued invoice amounts and identity cannot be changed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
