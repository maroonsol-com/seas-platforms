ALTER TABLE invoice_sequences FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TRIGGER doctor_leave_reject_delete
BEFORE DELETE ON doctor_leave
FOR EACH ROW EXECUTE FUNCTION clinic_reject_delete();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION clinic_calculate_invoice_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  extended_price numeric;
  taxable numeric;
BEGIN
  extended_price := round(NEW.quantity * NEW.unit_price, 2);
  taxable := round(extended_price - NEW.discount, 2);
  IF taxable < 0 THEN
    RAISE EXCEPTION 'invoice line discount exceeds the extended price'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.tax_amount := round(taxable * NEW.tax_rate / 100, 2);
  NEW.line_total := taxable + NEW.tax_amount;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_items_calculate
BEFORE INSERT OR UPDATE ON invoice_items
FOR EACH ROW EXECUTE FUNCTION clinic_calculate_invoice_line();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION clinic_refresh_invoice_totals(target_invoice uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  sums record;
BEGIN
  SELECT
    coalesce(sum(round(quantity * unit_price, 2)), 0) AS subtotal,
    coalesce(sum(discount), 0) AS discount_total,
    coalesce(sum(tax_amount), 0) AS tax_total,
    coalesce(sum(line_total), 0) AS total
  INTO sums
  FROM invoice_items
  WHERE invoice_id = target_invoice;

  UPDATE invoices
  SET
    subtotal = sums.subtotal,
    discount_total = sums.discount_total,
    tax_total = sums.tax_total,
    total = sums.total,
    balance = sums.total - amount_paid,
    updated_at = now()
  WHERE id = target_invoice
    AND status = 'draft';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION clinic_invoice_items_refresh_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM clinic_refresh_invoice_totals(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END
  );
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_items_refresh_parent
AFTER INSERT OR UPDATE OR DELETE ON invoice_items
FOR EACH ROW EXECUTE FUNCTION clinic_invoice_items_refresh_parent();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION clinic_finalize_invoice_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sums record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status <> 'draft' THEN
    SELECT
      coalesce(sum(round(quantity * unit_price, 2)), 0) AS subtotal,
      coalesce(sum(discount), 0) AS discount_total,
      coalesce(sum(tax_amount), 0) AS tax_total,
      coalesce(sum(line_total), 0) AS total
    INTO sums
    FROM invoice_items
    WHERE invoice_id = NEW.id;

    NEW.subtotal := sums.subtotal;
    NEW.discount_total := sums.discount_total;
    NEW.tax_total := sums.tax_total;
    NEW.total := sums.total;
    NEW.balance := sums.total - NEW.amount_paid;
    IF NEW.finalized_at IS NULL THEN
      NEW.finalized_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoices_finalize_totals
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION clinic_finalize_invoice_totals();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION next_invoice_number(target_business uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  allocated integer;
  current_business uuid;
BEGIN
  current_business := nullif(current_setting('app.current_business_id', true), '')::uuid;
  IF target_business IS DISTINCT FROM current_business THEN
    RAISE EXCEPTION 'invoice numbers can only be allocated for the current business'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO invoice_sequences AS sequences (business_id, last_number)
  VALUES (target_business, 1)
  ON CONFLICT (business_id) DO UPDATE
    SET last_number = sequences.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO allocated;

  RETURN 'INV-' || lpad(allocated::text, 6, '0');
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION clinic_reject_service_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source_type = 'service' THEN
    RAISE EXCEPTION 'services do not change stock quantities'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_movements_reject_service
BEFORE INSERT ON stock_movements
FOR EACH ROW EXECUTE FUNCTION clinic_reject_service_stock();
