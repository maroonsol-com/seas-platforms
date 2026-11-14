import { AdminError } from "./errors";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ENV_VAR = /^[A-Z][A-Z0-9_]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d+(\.\d{1,2})?$/;

export function requiredText(value: FormDataEntryValue | null, label: string): string {
  const text = String(value ?? "").trim();
  if (text.length === 0) {
    throw new AdminError(`${label} is required.`);
  }
  return text;
}

export function optionalText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text.length === 0 ? null : text;
}

export function emailValue(value: FormDataEntryValue | null, label: string): string {
  const email = requiredText(value, label).toLowerCase();
  if (!EMAIL.test(email)) {
    throw new AdminError(`${label} must be an email address.`);
  }
  return email;
}

export function dateValue(value: FormDataEntryValue | null, label: string): string {
  const date = requiredText(value, label);
  if (!DATE.test(date)) {
    throw new AdminError(`${label} must be a date.`);
  }
  return date;
}

export function moneyValue(value: FormDataEntryValue | null, label: string): string {
  const amount = requiredText(value, label);
  if (!MONEY.test(amount) || Number(amount) < 0) {
    throw new AdminError(`${label} must be a non-negative amount.`);
  }
  return Number(amount).toFixed(2);
}

export function positiveMoney(value: FormDataEntryValue | null, label: string): string {
  const amount = moneyValue(value, label);
  if (Number(amount) <= 0) {
    throw new AdminError(`${label} must be greater than zero.`);
  }
  return amount;
}

export function integerValue(value: FormDataEntryValue | null, label: string, fallback = 0): number {
  const text = String(value ?? "").trim();
  if (text.length === 0) {
    return fallback;
  }
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new AdminError(`${label} must be a whole number.`);
  }
  return parsed;
}

export function optionalInteger(value: FormDataEntryValue | null, label: string): number | null {
  const text = String(value ?? "").trim();
  if (text.length === 0) {
    return null;
  }
  return integerValue(value, label);
}

export function gstinValue(value: FormDataEntryValue | null): string | null {
  const gstin = optionalText(value);
  if (!gstin) {
    return null;
  }
  if (!/^[0-9A-Z]{15}$/.test(gstin.toUpperCase())) {
    throw new AdminError("GSTIN must be 15 characters.");
  }
  return gstin.toUpperCase();
}

export function envVarName(value: FormDataEntryValue | null): string | null {
  const name = optionalText(value);
  if (!name) {
    return null;
  }
  if (!ENV_VAR.test(name)) {
    throw new AdminError("The secret environment variable must be an uppercase name such as CLINIC_PROVISIONING_SECRET.");
  }
  return name;
}

export function featureList(value: FormDataEntryValue | null): string[] {
  return [...new Set(String(value ?? "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

export function metadataObject(value: FormDataEntryValue | null): Record<string, unknown> {
  const text = String(value ?? "").trim();
  if (text.length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new AdminError("Metadata must be a JSON object.");
  }
}

export function pageNumber(value: string | string[] | undefined): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
