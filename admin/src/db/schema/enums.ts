import { pgEnum } from "drizzle-orm/pg-core";

export const administratorStatusEnum = pgEnum("administrator_status", [
  "active",
  "disabled",
]);

export const productStatusEnum = pgEnum("product_status", ["active", "inactive"]);

export const platformBusinessStatusEnum = pgEnum("platform_business_status", [
  "provisioning_pending",
  "active",
  "suspended",
  "archived",
]);

export const billingCycleEnum = pgEnum("billing_cycle", [
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
  "custom",
]);

export const planStatusEnum = pgEnum("plan_status", ["active", "inactive"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trial",
  "active",
  "expiring_soon",
  "expired",
  "suspended",
  "cancelled",
]);

export const subscriptionEventTypeEnum = pgEnum("subscription_event_type", [
  "assigned",
  "plan_changed",
  "renewed",
  "extended",
  "activated",
  "suspended",
  "reactivated",
  "cancelled",
  "expired",
]);

export const manualPaymentMethodEnum = pgEnum("manual_payment_method", [
  "bank_transfer",
  "upi",
  "cash",
  "other",
]);

export const manualPaymentStatusEnum = pgEnum("manual_payment_status", [
  "recorded",
  "received",
  "voided",
]);

export const provisioningStatusEnum = pgEnum("provisioning_status", [
  "pending",
  "in_progress",
  "succeeded",
  "failed",
]);
