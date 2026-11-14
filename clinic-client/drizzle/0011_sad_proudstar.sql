ALTER TABLE "invoices" DROP CONSTRAINT "invoices_amounts_nonnegative";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_balance_equation";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "credit_total" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_nonnegative" CHECK (
    "invoices"."subtotal" >= 0 AND "invoices"."discount_total" >= 0 AND "invoices"."tax_total" >= 0
    AND "invoices"."total" >= 0 AND "invoices"."amount_paid" >= 0 AND "invoices"."credit_total" >= 0
    AND "invoices"."credit_total" <= "invoices"."total"
  );--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_balance_equation" CHECK ("invoices"."balance" = "invoices"."total" - "invoices"."amount_paid" - "invoices"."credit_total");--> statement-breakpoint
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
    balance = sums.total - amount_paid - credit_total,
    updated_at = now()
  WHERE id = target_invoice
    AND status = 'draft';
END;
$$;--> statement-breakpoint
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
    NEW.balance := sums.total - NEW.amount_paid - NEW.credit_total;
    IF NEW.finalized_at IS NULL THEN
      NEW.finalized_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;