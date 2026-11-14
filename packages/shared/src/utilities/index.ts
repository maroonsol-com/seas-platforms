import type { DatabaseVariableName } from "../types";

const PLACEHOLDER_MARKERS = [
  "USER:PASSWORD",
  "PLACEHOLDER",
  "ep-ADMIN-HOST",
  "ep-CLINIC-HOST",
  "REPLACE_ME",
] as const;

export function isPlaceholderDatabaseUrl(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    return true;
  }

  return PLACEHOLDER_MARKERS.some((marker) => trimmed.includes(marker));
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export function assertPostgresConnectionString(input: {
  application: string;
  variableName: DatabaseVariableName;
  value: string | undefined;
  directConnection: boolean;
}): string {
  const value = input.value?.trim() ?? "";

  if (isPlaceholderDatabaseUrl(value)) {
    throw new Error(
      `${input.application}: ${input.variableName} is missing or still a placeholder. Replace it with this application's Neon connection string. No database connection was opened.`,
    );
  }

  if (!value.startsWith("postgresql://") && !value.startsWith("postgres://")) {
    throw new Error(
      `${input.application}: ${input.variableName} must be a PostgreSQL connection string. No database connection was opened.`,
    );
  }

  if (input.directConnection && value.includes("-pooler")) {
    throw new Error(
      `${input.application}: ${input.variableName} points at a Neon pooler host. Migrations require the direct, unpooled connection string. No database connection was opened.`,
    );
  }

  return value;
}

/** Neon pooler URLs can share a small client pool. A direct URL must stay smaller. */
export function runtimePoolMax(connectionString: string): number {
  return connectionString.includes("-pooler") ? 5 : 2;
}

export {
  localDateIso,
  subscriptionAccessAllowed,
} from "./subscription-access";
