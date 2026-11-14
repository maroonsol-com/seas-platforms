export const PLATFORM_PERMISSIONS = [
  ["products.read", "View products"],
  ["products.write", "Create and edit products"],
  ["businesses.read", "View businesses"],
  ["businesses.write", "Create and edit businesses"],
  ["subscriptions.read", "View subscriptions"],
  ["subscriptions.write", "Change subscriptions"],
  ["plans.read", "View subscription plans"],
  ["plans.write", "Create and edit subscription plans"],
  ["payments.read", "View payments"],
  ["payments.write", "Record payments"],
  ["administrators.read", "View administrators"],
  ["administrators.write", "Invite and change administrators"],
  ["audit.read", "View audit logs"],
  ["settings.read", "View platform settings"],
  ["provisioning.retry", "Retry business provisioning"],
] as const;

export const SUPER_ADMIN_ROLE = "SUPER_ADMIN";

export const INITIAL_SUPER_ADMIN = {
  name: "Manjeet Chandra",
  displayName: "Manjeet Chandra",
  email: "majormchandra@gmail.com",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
} as const;

export const PROVISIONING_LABELS = {
  pending: "PENDING",
  in_progress: "PROVISIONING",
  succeeded: "PROVISIONED",
  failed: "FAILED",
} as const;

export const PAGE_SIZE = 20;
