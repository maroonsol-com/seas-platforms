import { ClinicError } from "./errors";

const DECIMAL = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/;

function minorUnits(value: string, scale: number): bigint {
  const match = DECIMAL.exec(value.trim());
  if (!match) {
    throw new ClinicError("Enter a valid amount.");
  }
  const fraction = match[1] ?? "";
  if (fraction.length > scale) {
    throw new ClinicError("Enter a valid amount.");
  }
  const padded = (fraction + "0".repeat(scale)).slice(0, scale);
  const whole = value.trim().split(".")[0] ?? "0";
  return BigInt(whole) * (BigInt(10) ** BigInt(scale)) + BigInt(padded || "0");
}

/** Keeps the original decimal text. The database stores it as numeric. */
export function decimalText(value: string, scale: number, label: string, allowZero: boolean): string {
  const trimmed = value.trim();
  let units: bigint;
  try {
    units = minorUnits(trimmed, scale);
  } catch {
    throw new ClinicError(`${label} is not a valid amount.`);
  }
  if (units < BigInt(0) || (!allowZero && units === BigInt(0))) {
    throw new ClinicError(allowZero ? `${label} cannot be negative.` : `${label} must be greater than zero.`);
  }
  return trimmed;
}

export function moneyText(value: string, label: string, allowZero = true): string {
  return decimalText(value, 2, label, allowZero);
}

export function quantityText(value: string): string {
  return decimalText(value, 3, "Quantity", false);
}
