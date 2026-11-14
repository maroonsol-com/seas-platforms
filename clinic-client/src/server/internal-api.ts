import {
  SERVICE_SIGNATURE_HEADER,
  SERVICE_TIMESTAMP_HEADER,
  verifyServiceRequest,
} from "@saas/auth-core";
import { subscriptionAccessAllowed } from "@saas/shared";
import { sql } from "drizzle-orm";

import { withServiceRoleTransaction, withTenantTransaction } from "../db/tenant-transaction";
import { subscriptionSnapshots } from "../db/schema";

type ProvisionPayload = {
  idempotencyKey?: string;
  platformBusinessId?: string;
  legalName?: string;
  displayName?: string;
  timezone?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerMobile?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

type EntitlementPayload = {
  productBusinessId?: string;
  status?: string;
  planName?: string;
  startsOn?: string;
  expiresOn?: string;
  timezone?: string;
};

function firstId(result: unknown): string | undefined {
  const rows = Array.isArray(result)
    ? result
    : result && typeof result === "object" && "rows" in result
      ? (result as { rows: Array<{ id?: string }> }).rows
      : [];
  return rows[0]?.id;
}

function authorized(request: Request, body: string): boolean {
  return verifyServiceRequest({
    secret: process.env.CLINIC_PROVISIONING_SECRET?.trim() ?? "",
    timestamp: request.headers.get(SERVICE_TIMESTAMP_HEADER) ?? "",
    signature: request.headers.get(SERVICE_SIGNATURE_HEADER) ?? "",
    body,
  });
}

export async function handleProvisionRequest(request: Request): Promise<Response> {
  const body = await request.text();
  if (!authorized(request, body)) {
    return Response.json({ error: "The provisioning request was rejected." }, { status: 401 });
  }

  let payload: ProvisionPayload;
  try {
    payload = JSON.parse(body) as ProvisionPayload;
  } catch {
    return Response.json({ error: "Invalid provisioning request." }, { status: 400 });
  }

  const required = [
    payload.platformBusinessId,
    payload.legalName,
    payload.displayName,
    payload.ownerName,
    payload.ownerEmail,
    payload.addressLine1,
    payload.city,
    payload.state,
    payload.postalCode,
  ];
  if (required.some((value) => !value || value.trim().length === 0)) {
    return Response.json({ error: "The provisioning request is incomplete." }, { status: 400 });
  }

  try {
    const productBusinessId = await withServiceRoleTransaction(async (tx) => {
      const result = await tx.execute(sql`
        select provision_clinic_business(
          cast(${payload.platformBusinessId} as uuid),
          ${payload.legalName},
          ${payload.displayName},
          ${payload.timezone || "Asia/Kolkata"},
          ${payload.ownerName},
          ${payload.ownerEmail},
          ${payload.ownerMobile ?? ""},
          ${payload.addressLine1},
          ${payload.city},
          ${payload.state},
          ${payload.postalCode}
        ) as id
      `);
      return firstId(result);
    });
    if (!productBusinessId) {
      return Response.json({ error: "Provisioning did not return a clinic business." }, { status: 500 });
    }
    return Response.json({ productBusinessId, idempotencyKey: payload.idempotencyKey ?? null });
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : error instanceof Error
        ? error.message
        : "Provisioning failed.";
    return Response.json({
      error: "The clinic business could not be provisioned.",
      detail: cause.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]").slice(0, 200),
    }, { status: 500 });
  }
}

export async function handleEntitlementRequest(request: Request): Promise<Response> {
  const body = await request.text();
  if (!authorized(request, body)) {
    return Response.json({ error: "The entitlement request was rejected." }, { status: 401 });
  }

  let payload: EntitlementPayload;
  try {
    payload = JSON.parse(body) as EntitlementPayload;
  } catch {
    return Response.json({ error: "Invalid entitlement request." }, { status: 400 });
  }
  if (!payload.productBusinessId || !payload.status || !payload.planName || !payload.startsOn || !payload.expiresOn) {
    return Response.json({ error: "The entitlement request is incomplete." }, { status: 400 });
  }

  const timezone = payload.timezone || "Asia/Kolkata";
  try {
    await withTenantTransaction(payload.productBusinessId, async (tx) => {
      await tx.insert(subscriptionSnapshots).values({
        businessId: payload.productBusinessId!,
        status: payload.status!,
        planName: payload.planName!,
        startsOn: payload.startsOn!,
        expiresOn: payload.expiresOn!,
        timezone,
      }).onConflictDoUpdate({
        target: subscriptionSnapshots.businessId,
        set: {
          status: payload.status!,
          planName: payload.planName!,
          startsOn: payload.startsOn!,
          expiresOn: payload.expiresOn!,
          timezone,
          updatedAt: new Date(),
        },
      });
    });
  } catch {
    return Response.json({ error: "The subscription snapshot could not be saved." }, { status: 500 });
  }

  return Response.json({
    ok: true,
    access: subscriptionAccessAllowed({
      status: payload.status,
      expiresOn: payload.expiresOn,
      timezone,
    }),
  });
}
