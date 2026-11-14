import { NextResponse } from "next/server";

import { requestAdministratorOtp } from "@/server/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string } | null;
  const email = body?.email?.trim() ?? "";
  if (!email.includes("@")) {
    return NextResponse.json({ status: "invalid", message: "Enter an email address." }, { status: 400 });
  }

  const result = await requestAdministratorOtp(email);
  if (result === "not_configured") {
    return NextResponse.json({
      status: "not_configured",
      message: "Email delivery is not configured. A sign-in code cannot be sent until SMTP credentials are added.",
    });
  }
  if (result === "delivery_failed") {
    return NextResponse.json({
      status: "delivery_failed",
      message: "The sign-in code could not be sent. Try again later.",
    }, { status: 503 });
  }
  return NextResponse.json({
    status: "accepted",
    message: "If this address is authorized, a sign-in code was sent.",
  });
}
