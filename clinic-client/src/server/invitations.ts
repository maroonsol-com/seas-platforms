import { createHash } from "node:crypto";

import { signServiceRequest, SERVICE_SIGNATURE_HEADER, SERVICE_TIMESTAMP_HEADER } from "@saas/auth-core";
import { and, eq, sql } from "drizzle-orm";

import { invitationMessage, membershipForInvitation, type InvitationState } from "@/lib/invitation-state";
import { auditLogs, businessMemberships, businesses, membershipRoles, roles, users } from "@/db/schema";
import { withServiceRoleTransaction, withTenantTransaction } from "@/db/tenant-transaction";

import { requestClinicOtp, revokeClinicToken, selectClinicBusiness, verifyClinicOtp } from "./auth";

export type { InvitationState };
export { invitationMessage, membershipForInvitation };

export type InvitationPreview = {
  state: InvitationState;
  businessName: string | null;
};

type AdminPreview = {
  state?: InvitationState;
  email?: string | null;
  platformBusinessId?: string | null;
  businessName?: string | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

async function callAdmin(payload: { action: "lookup" | "accept"; tokenHash: string; email?: string }): Promise<AdminPreview | null> {
  const base = process.env.ADMIN_APP_URL?.trim().replace(/\/$/, "") ?? "";
  const secret = process.env.CLINIC_PROVISIONING_SECRET?.trim() ?? "";
  if (!base || !secret) return null;
  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const response = await fetch(`${base}/api/internal/invitations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [SERVICE_TIMESTAMP_HEADER]: timestamp,
      [SERVICE_SIGNATURE_HEADER]: signServiceRequest(secret, timestamp, body),
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  return response.json() as Promise<AdminPreview>;
}

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  if (token.trim().length < 20) return { state: "invalid", businessName: null };
  const preview = await callAdmin({ action: "lookup", tokenHash: hashToken(token) });
  if (!preview?.state) return { state: "unavailable", businessName: null };
  return {
    state: preview.state,
    businessName: preview.state === "valid" ? preview.businessName ?? null : null,
  };
}

export async function startInvitationSignIn(token: string, emailInput: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const email = emailInput.trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, message: "Enter a valid email address." };
  const preview = await callAdmin({ action: "lookup", tokenHash: hashToken(token) });
  if (!preview?.state) return { ok: false, message: invitationMessage("unavailable") };
  if (preview.state !== "valid") return { ok: false, message: invitationMessage(preview.state) };
  if ((preview.email ?? "").trim().toLowerCase() !== email) {
    return { ok: false, message: invitationMessage("email_mismatch") };
  }
  const delivery = await requestClinicOtp(email);
  if (delivery === "not_configured") return { ok: false, message: "Email delivery is not configured." };
  if (delivery === "delivery_failed") return { ok: false, message: "The verification code could not be sent." };
  return { ok: true };
}

export async function completeInvitationSignIn(token: string, emailInput: string, code: string): Promise<{ token: string } | { message: string }> {
  const email = emailInput.trim().toLowerCase();
  const tokenHash = hashToken(token);
  const preview = await callAdmin({ action: "lookup", tokenHash });
  if (!preview?.state) return { message: invitationMessage("unavailable") };
  if (preview.state !== "valid" || !preview.platformBusinessId) return { message: invitationMessage(preview.state) };
  if ((preview.email ?? "").trim().toLowerCase() !== email) return { message: invitationMessage("email_mismatch") };

  const clinicBusiness = await withServiceRoleTransaction(async (tx) => {
    const [row] = await tx
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.platformBusinessId, preview.platformBusinessId!))
      .limit(1);
    return row ?? null;
  });
  if (!clinicBusiness) return { message: "This invitation is not connected to a clinic." };

  const verified = await verifyClinicOtp(email, code);
  if (!verified) return { message: "That code is invalid or has expired." };
  const invitedBusinessId = membershipForInvitation(verified.businesses, clinicBusiness.id);
  if (!invitedBusinessId) {
    await revokeClinicToken(verified.token);
    return { message: "This invitation does not grant access to that clinic." };
  }
  const owner = await withServiceRoleTransaction(async (tx) => {
    const [row] = await tx
      .select({ userId: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    return row ?? null;
  });
  const ownsClinic = owner
    ? await withTenantTransaction(invitedBusinessId, async (tx) => {
      const [membership] = await tx
        .select({ id: businessMemberships.id })
        .from(businessMemberships)
        .innerJoin(membershipRoles, eq(membershipRoles.membershipId, businessMemberships.id))
        .innerJoin(roles, and(eq(roles.id, membershipRoles.roleId), eq(roles.name, "Owner")))
        .where(and(
          eq(businessMemberships.businessId, invitedBusinessId),
          eq(businessMemberships.userId, owner.userId),
          eq(businessMemberships.status, "active"),
        ))
        .limit(1);
      return Boolean(membership);
    }, owner.userId)
    : false;
  if (!owner || !ownsClinic) {
    await revokeClinicToken(verified.token);
    return { message: "This invitation does not grant owner access." };
  }

  const accepted = await callAdmin({ action: "accept", tokenHash, email });
  if (accepted?.state !== "valid") {
    await revokeClinicToken(verified.token);
    return { message: invitationMessage(accepted?.state ?? "unavailable") };
  }
  await selectClinicBusiness(verified.token, invitedBusinessId);
  await withTenantTransaction(invitedBusinessId, async (tx) => {
    await tx.insert(auditLogs).values({
      businessId: invitedBusinessId,
      actorUserId: owner.userId,
      action: "invitation.accepted",
      entityType: "business",
      entityId: invitedBusinessId,
      metadata: {},
    });
  });
  return { token: verified.token };
}
