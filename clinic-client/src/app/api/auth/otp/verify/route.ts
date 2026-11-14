import { sessionCookieName, sessionCookieOptions } from "@saas/auth-core";
import { NextResponse } from "next/server";

import { sessionMaxAgeSeconds, verifyClinicOtp } from "@/server/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown; code?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const verified = await verifyClinicOtp(email, code);
  if (!verified) {
    return NextResponse.json({ message: "That code is invalid or has expired." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true, next: verified.businesses.length === 1 ? "/dashboard" : "/select-business" });
  response.cookies.set(sessionCookieName("clinic"), verified.token, sessionCookieOptions({
    secure: process.env.NODE_ENV === "production",
    maxAgeSeconds: sessionMaxAgeSeconds(),
  }));
  return response;
}
