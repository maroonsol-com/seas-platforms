import { requestOriginAllowed } from "@saas/auth-core/origin";
import { NextResponse } from "next/server";

export function proxy(request: Request) {
  const url = new URL(request.url);
  const allowed = requestOriginAllowed({
    method: request.method,
    appUrl: process.env.APP_URL ?? "",
    origin: request.headers.get("origin"),
    referer: request.headers.get("referer"),
    serviceRequest: url.pathname.startsWith("/api/internal"),
  });
  if (!allowed) {
    return NextResponse.json({ message: "The request origin was rejected." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|apple-touch-icon).*)"],
};
