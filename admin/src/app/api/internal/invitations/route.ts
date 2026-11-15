import { verifyServiceRequest, SERVICE_SIGNATURE_HEADER, SERVICE_TIMESTAMP_HEADER } from "@saas/auth-core";

import { acceptOwnerInvitation, lookupOwnerInvitation } from "@/server/invitations";

export async function POST(request: Request) {
  const body = await request.text();
  const authorized = verifyServiceRequest({
    secret: process.env.CLINIC_PROVISIONING_SECRET?.trim() ?? "",
    timestamp: request.headers.get(SERVICE_TIMESTAMP_HEADER) ?? "",
    signature: request.headers.get(SERVICE_SIGNATURE_HEADER) ?? "",
    body,
  });
  if (!authorized) {
    return Response.json({ error: "The invitation request was rejected." }, { status: 401 });
  }

  let payload: { action?: string; tokenHash?: string; email?: string };
  try {
    payload = JSON.parse(body) as { action?: string; tokenHash?: string; email?: string };
  } catch {
    return Response.json({ error: "Invalid invitation request." }, { status: 400 });
  }
  const tokenHash = payload.tokenHash?.trim() ?? "";
  if (tokenHash.length < 20) {
    return Response.json({ state: "invalid" });
  }

  if (payload.action === "lookup") {
    const preview = await lookupOwnerInvitation(tokenHash);
    return Response.json(preview);
  }
  if (payload.action === "accept") {
    const state = await acceptOwnerInvitation(tokenHash, payload.email ?? "");
    return Response.json({ state });
  }
  return Response.json({ error: "Invalid invitation request." }, { status: 400 });
}
