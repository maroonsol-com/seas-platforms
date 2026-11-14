import { sessionCookieName } from "@saas/auth-core";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { revokeSessionToken } from "@/server/auth";

export async function POST(request: Request) {
  const store = await cookies();
  const name = sessionCookieName("admin");
  await revokeSessionToken(store.get(name)?.value);
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
