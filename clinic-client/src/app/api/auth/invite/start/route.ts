import { NextResponse } from "next/server";

import { startInvitationSignIn } from "@/server/invitations";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown; email?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const email = typeof body?.email === "string" ? body.email : "";
  const result = await startInvitationSignIn(token, email);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
