import { sessionCookieName, sessionCookieOptions } from "@saas/auth-core";
import { NextResponse } from "next/server";

import { sessionMaxAgeSeconds } from "@/server/auth";
import { completeInvitationSignIn } from "@/server/invitations";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown; email?: unknown; code?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const email = typeof body?.email === "string" ? body.email : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const result = await completeInvitationSignIn(token, email, code);
  if ("message" in result) return NextResponse.json({ message: result.message }, { status: 400 });
  const response = NextResponse.json({ ok: true, next: "/dashboard" });
  response.cookies.set(sessionCookieName("clinic"), result.token, sessionCookieOptions({
    secure: process.env.NODE_ENV === "production",
    maxAgeSeconds: sessionMaxAgeSeconds(),
  }));
  return response;
}
