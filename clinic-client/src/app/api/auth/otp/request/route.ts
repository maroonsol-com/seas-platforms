import { NextResponse } from "next/server";

import { requestClinicOtp } from "@/server/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  if (!email.includes("@")) {
    return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
  }
  const result = await requestClinicOtp(email);
  if (result === "not_configured") {
    return NextResponse.json({ status: "not_configured", message: "Email delivery is not configured. A sign-in code cannot be sent until SMTP credentials are added." });
  }
  if (result === "delivery_failed") {
    return NextResponse.json({ status: "delivery_failed", message: "The sign-in code could not be sent." }, { status: 503 });
  }
  return NextResponse.json({ status: "accepted", message: "If this address is authorized, a sign-in code was sent." });
}
