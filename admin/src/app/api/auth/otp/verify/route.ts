import { NextResponse } from "next/server";

import { adminSessionCookie, verifyAdministratorOtp } from "@/server/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string; code?: string } | null;
  const result = await verifyAdministratorOtp({
    email: body?.email ?? "",
    code: body?.code ?? "",
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  });

  if ("error" in result) {
    return NextResponse.json({ ok: false, message: result.error }, { status: 401 });
  }

  const cookie = adminSessionCookie(result.token);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
