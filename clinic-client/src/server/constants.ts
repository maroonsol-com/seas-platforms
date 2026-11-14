export const PAGE_SIZE = 20;

export function pageNumber(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export const CLINIC_PERMISSIONS = [
  "patients.read",
  "patients.write",
  "products.read",
  "products.write",
  "services.read",
  "services.write",
  "invoices.read",
  "invoices.write",
  "payments.read",
  "payments.write",
  "reports.read",
  "settings.read",
  "settings.write",
] as const;

export type ClinicPermission = (typeof CLINIC_PERMISSIONS)[number];

export const WRITE_PERMISSIONS = new Set<ClinicPermission>([
  "patients.write",
  "products.write",
  "services.write",
  "invoices.write",
  "payments.write",
  "settings.write",
]);
