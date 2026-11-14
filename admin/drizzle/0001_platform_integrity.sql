-- Platform records are archived or voided. They are not deleted.
CREATE OR REPLACE FUNCTION admin_reject_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'records in % cannot be %', TG_TABLE_NAME, lower(TG_OP)
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER businesses_reject_delete
BEFORE DELETE ON businesses
FOR EACH ROW EXECUTE FUNCTION admin_reject_delete();
--> statement-breakpoint
CREATE TRIGGER business_subscriptions_reject_delete
BEFORE DELETE ON business_subscriptions
FOR EACH ROW EXECUTE FUNCTION admin_reject_delete();
--> statement-breakpoint
CREATE TRIGGER subscription_events_reject_delete
BEFORE DELETE ON subscription_events
FOR EACH ROW EXECUTE FUNCTION admin_reject_delete();
--> statement-breakpoint
CREATE TRIGGER subscription_events_reject_update
BEFORE UPDATE ON subscription_events
FOR EACH ROW EXECUTE FUNCTION admin_reject_delete();
--> statement-breakpoint
CREATE TRIGGER manual_payments_reject_delete
BEFORE DELETE ON manual_payments
FOR EACH ROW EXECUTE FUNCTION admin_reject_delete();
--> statement-breakpoint
CREATE TRIGGER invitations_reject_delete
BEFORE DELETE ON invitations
FOR EACH ROW EXECUTE FUNCTION admin_reject_delete();
--> statement-breakpoint
CREATE TRIGGER business_provisioning_reject_delete
BEFORE DELETE ON business_provisioning
FOR EACH ROW EXECUTE FUNCTION admin_reject_delete();
--> statement-breakpoint
CREATE TRIGGER platform_audit_logs_reject_delete
BEFORE DELETE ON platform_audit_logs
FOR EACH ROW EXECUTE FUNCTION admin_reject_delete();
--> statement-breakpoint
CREATE TRIGGER platform_audit_logs_reject_update
BEFORE UPDATE ON platform_audit_logs
FOR EACH ROW EXECUTE FUNCTION admin_reject_delete();
--> statement-breakpoint
CREATE TRIGGER administrative_activity_logs_reject_delete
BEFORE DELETE ON administrative_activity_logs
FOR EACH ROW EXECUTE FUNCTION admin_reject_delete();
--> statement-breakpoint
CREATE TRIGGER administrative_activity_logs_reject_update
BEFORE UPDATE ON administrative_activity_logs
FOR EACH ROW EXECUTE FUNCTION admin_reject_delete();
--> statement-breakpoint
-- A business belongs to one product for its lifetime.
CREATE OR REPLACE FUNCTION admin_lock_business_product()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a business cannot be detached from its SaaS product'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id THEN
    RAISE EXCEPTION 'a business cannot be moved to another SaaS product'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER business_products_lock
BEFORE UPDATE OR DELETE ON business_products
FOR EACH ROW EXECUTE FUNCTION admin_lock_business_product();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION admin_require_business_product()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM business_products WHERE business_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'a business must be linked to exactly one SaaS product'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER businesses_require_product
AFTER INSERT ON businesses
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION admin_require_business_product();
