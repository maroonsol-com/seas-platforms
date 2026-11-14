import { NextResponse } from "next/server";

import { databaseOwnership, PLATFORM_NAME } from "@saas/shared";

export function GET() {
  return NextResponse.json({
    ok: true,
    platform: PLATFORM_NAME,
    application: "clinic",
    phase: 4,
    database: {
      connected: false,
      runtimeVariable: databaseOwnership.clinic.runtimeVariable,
      migrationVariable: databaseOwnership.clinic.migrationVariable,
    },
  });
}
