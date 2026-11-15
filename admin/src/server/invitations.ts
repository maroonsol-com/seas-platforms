import { createHash } from "node:crypto";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { withAdminTransaction } from "@/db/transaction";
import { businesses, invitations } from "@/db/schema";

import { writeAudit } from "./audit";

export type InvitationState = "valid" | "expired" | "accepted" | "revoked" | "invalid" | "email_mismatch";

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function classifyInvitation(
  row: { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null } | null,
  now = Date.now(),
): InvitationState {
  if (!row) return "invalid";
  if (row.revokedAt) return "revoked";
  if (row.acceptedAt) return "accepted";
  if (row.expiresAt.getTime() <= now) return "expired";
  return "valid";
}

export function canAssignRole(actorRoleNames: readonly string[], targetRoleName: string): boolean {
  if (targetRoleName !== "SUPER_ADMIN") return true;
  return actorRoleNames.includes("SUPER_ADMIN");
}

export type InvitationPreview = {
  state: InvitationState;
  email: string | null;
  platformBusinessId: string | null;
  businessName: string | null;
};

export async function lookupOwnerInvitation(tokenHash: string): Promise<InvitationPreview> {
  return withAdminTransaction(async (tx) => {
    const [row] = await tx
      .select({
        email: invitations.email,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        platformBusinessId: invitations.businessId,
        businessName: businesses.displayName,
      })
      .from(invitations)
      .innerJoin(businesses, eq(businesses.id, invitations.businessId))
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1);
    const state = classifyInvitation(row ?? null);
    if (state !== "valid" || !row) {
      return { state, email: null, platformBusinessId: null, businessName: null };
    }
    return {
      state,
      email: row.email,
      platformBusinessId: row.platformBusinessId,
      businessName: row.businessName,
    };
  });
}

export async function acceptOwnerInvitation(tokenHash: string, emailInput: string): Promise<InvitationState> {
  const email = emailInput.trim().toLowerCase();
  return withAdminTransaction(async (tx) => {
    const [row] = await tx
      .select({
        id: invitations.id,
        email: invitations.email,
        businessId: invitations.businessId,
        productId: invitations.productId,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
      })
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1);
    const state = classifyInvitation(row ?? null);
    if (state !== "valid" || !row) return state;
    if (row.email.trim().toLowerCase() !== email) return "email_mismatch";
    const updated = await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(and(
        eq(invitations.id, row.id),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
        sql`lower(${invitations.email}) = ${email}`,
      ))
      .returning({ id: invitations.id });
    if (updated.length === 0) return "accepted";
    await writeAudit(tx, {
      actorAdministratorId: null,
      action: "invitation.accepted",
      summary: "An owner accepted an invitation.",
      entityType: "invitation",
      entityId: row.id,
      businessId: row.businessId,
      productId: row.productId,
    });
    return "valid";
  });
}
