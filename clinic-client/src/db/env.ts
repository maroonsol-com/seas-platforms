import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  assertPostgresConnectionString,
  isPlaceholderDatabaseUrl,
  runtimePoolMax,
} from "@saas/shared";

const APPLICATION = "clinic";
const EXPECTED_TARGET = "clinic";

function readDotEnvFile(filePath: string): Record<string, string> | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const values: Record<string, string> = {};

  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function assertApplicationTarget(): void {
  if (process.env.APP_DATABASE_TARGET !== EXPECTED_TARGET) {
    throw new Error(
      `${APPLICATION}: APP_DATABASE_TARGET must be "${EXPECTED_TARGET}" in clinic-client/.env. Refusing to use another application's database. No database connection was opened.`,
    );
  }
}

export function readRuntimeDatabaseUrl(): string {
  assertApplicationTarget();

  return assertPostgresConnectionString({
    application: APPLICATION,
    variableName: "DATABASE_URL",
    value: process.env.DATABASE_URL,
    directConnection: false,
  });
}

/**
 * Client-side pool size for the WebSocket driver. The HTTP driver does not
 * hold a Postgres session. A pooled Neon URL may use a few clients. A direct
 * URL stays at two so it does not exhaust the compute connection limit.
 */
export function readRuntimePoolMax(): number {
  return runtimePoolMax(readRuntimeDatabaseUrl());
}

const OFFLINE_DRIZZLE_COMMANDS = new Set(["generate", "check"]);
const OFFLINE_DRIZZLE_URL = "postgresql://offline:offline@127.0.0.1:1/clinic_offline";

function drizzleKitCommand(): string | undefined {
  return process.argv.find((argument) =>
    ["generate", "migrate", "studio", "check", "push", "pull", "up", "export"].includes(
      argument,
    ),
  );
}

/**
 * Generate and check do not open a connection. Migrate, studio, and push do.
 * A placeholder URL is replaced with a local offline URL only for generate and
 * check. Migrate still refuses placeholders, so it cannot reach another database.
 */
export function resolveDrizzleKitUrl(): string {
  const fileValues = readDotEnvFile(path.join(process.cwd(), ".env"));
  const target = fileValues?.APP_DATABASE_TARGET ?? process.env.APP_DATABASE_TARGET;
  const connectionString =
    fileValues?.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_UNPOOLED;

  if (target !== EXPECTED_TARGET) {
    throw new Error(
      `${APPLICATION}: APP_DATABASE_TARGET must be "${EXPECTED_TARGET}" in clinic-client/.env. Refusing to use another application's database. No database connection was opened.`,
    );
  }

  const command = drizzleKitCommand();
  if (!command) {
    throw new Error(
      `${APPLICATION}: Drizzle Kit command was not recognized. No database connection was opened.`,
    );
  }

  if (OFFLINE_DRIZZLE_COMMANDS.has(command) && isPlaceholderDatabaseUrl(connectionString)) {
    return OFFLINE_DRIZZLE_URL;
  }

  return assertPostgresConnectionString({
    application: APPLICATION,
    variableName: "DATABASE_URL_UNPOOLED",
    value: connectionString,
    directConnection: true,
  });
}

export function readMigrationDatabaseUrl(): string {
  return resolveDrizzleKitUrl();
}
