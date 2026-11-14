import type { ApplicationId, DatabaseOwnership } from "../types";

export const PLATFORM_NAME = "SaaS Platform";

export const databaseOwnership = {
  admin: {
    application: "admin",
    envFile: "admin/.env",
    drizzleConfig: "admin/drizzle.config.ts",
    runtimeVariable: "DATABASE_URL",
    migrationVariable: "DATABASE_URL_UNPOOLED",
    purpose: "Platform administration only. No clinic operational records.",
  },
  clinic: {
    application: "clinic",
    envFile: "clinic-client/.env",
    drizzleConfig: "clinic-client/drizzle.config.ts",
    runtimeVariable: "DATABASE_URL",
    migrationVariable: "DATABASE_URL_UNPOOLED",
    purpose: "Clinic operations only. No platform administration records.",
  },
} as const satisfies Record<ApplicationId, DatabaseOwnership>;
