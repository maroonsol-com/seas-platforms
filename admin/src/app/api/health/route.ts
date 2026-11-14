import { NextResponse } from "next/server";

import { databaseOwnership, PLATFORM_NAME } from "@saas/shared";

export function GET() {
  return NextResponse.json({
    ok: true,
    platform: PLATFORM_NAME,
    application: "admin",
    phase: 3,
    database: {
      connected: false,
      runtimeVariable: databaseOwnership.admin.runtimeVariable,
      migrationVariable: databaseOwnership.admin.migrationVariable,
    },
  });
}
