import { sessionCookieName, sessionCookieOptions } from "@saas/auth-core";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { revokeClinicToken, sessionMaxAgeSeconds } from "@/server/auth";

export async function POST() {
  const token = (await cookies()).get(sessionCookieName("clinic"))?.value;
  if (token) await revokeClinicToken(token);
  const response = NextResponse.redirect(new URL("/login", process.env.APP_URL || "http://localhost:3001"), 303);
  response.cookies.set(sessionCookieName("clinic"), "", sessionCookieOptions({
    secure: process.env.NODE_ENV === "production",
    maxAgeSeconds: sessionMaxAgeSeconds(),
  }));
  response.cookies.set(sessionCookieName("clinic"), "", { path: "/", maxAge: 0 });
  return response;
}
