import { createHash, randomBytes } from "node:crypto";

import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  generateOtpCode,
  hashOtp,
  otpHashesMatch,
  sessionCookieOptions,
} from "@saas/auth-core";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { getAdminDatabase, withAdminTransaction } from "@/db/transaction";
import {
  administratorOtpChallenges,
  administratorSessions,
  platformAdministratorRoles,
  platformAdministrators,
  platformPermissions,
  platformRolePermissions,
  platformRoles,
} from "@/db/schema";

import { writeAudit } from "./audit";
import { isSmtpConfigured, sendEmail } from "./mail";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type AdminPrincipal = {
  sessionId: string;
  administratorId: string;
  email: string;
  name: string;
  displayName: string | null;
  permissions: string[];
  roles: string[];
};

function authSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim() ?? "";
  if (secret.length === 0) {
    throw new Error("AUTH_SECRET is not configured.");
  }
  return secret;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export type OtpRequestResult = "accepted" | "not_configured" | "delivery_failed";

export async function requestAdministratorOtp(emailInput: string): Promise<OtpRequestResult> {
  if (!isSmtpConfigured()) {
    return "not_configured";
  }

  const email = emailInput.trim().toLowerCase();
  const [administrator] = await getAdminDatabase()
    .select({ id: platformAdministrators.id, status: platformAdministrators.status })
    .from(platformAdministrators)
    .where(eq(platformAdministrators.email, email))
    .limit(1);

  if (!administrator || administrator.status !== "active") {
    return "accepted";
  }

  const now = new Date();
  const recent = await getAdminDatabase()
    .select({ id: administratorOtpChallenges.id })
    .from(administratorOtpChallenges)
    .where(and(
      eq(administratorOtpChallenges.email, email),
      isNull(administratorOtpChallenges.consumedAt),
      gt(administratorOtpChallenges.sentAt, new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS)),
    ))
    .limit(1);
  if (recent.length > 0) {
    return "accepted";
  }

  const [hourly] = await getAdminDatabase()
    .select({ value: sql<number>`count(*)::int` })
    .from(administratorOtpChallenges)
    .where(and(
      eq(administratorOtpChallenges.email, email),
      gt(administratorOtpChallenges.createdAt, new Date(now.getTime() - 60 * 60 * 1000)),
    ));
  if ((hourly?.value ?? 0) >= OTP_MAX_ATTEMPTS) {
    return "accepted";
  }

  const code = generateOtpCode();
  const [challenge] = await getAdminDatabase()
    .insert(administratorOtpChallenges)
    .values({
      email,
      codeHash: hashOtp(code, authSecret()),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      sentAt: now,
    })
    .returning({ id: administratorOtpChallenges.id });

  const delivery = await sendEmail({
    to: email,
    subject: "Your admin sign-in code",
    text: `Your sign-in code is ${code}. It expires in 5 minutes. If you did not request it, ignore this email.`,
  });

  if (delivery !== "sent") {
    if (challenge) {
      await getAdminDatabase()
        .delete(administratorOtpChallenges)
        .where(eq(administratorOtpChallenges.id, challenge.id));
    }
    return "delivery_failed";
  }

  return "accepted";
}

export async function verifyAdministratorOtp(input: {
  email: string;
  code: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string } | { error: string }> {
  const email = input.email.trim().toLowerCase();
  const code = input.code.trim();
  const [administrator] = await getAdminDatabase()
    .select({ id: platformAdministrators.id, status: platformAdministrators.status })
    .from(platformAdministrators)
    .where(eq(platformAdministrators.email, email))
    .limit(1);

  const [challenge] = await getAdminDatabase()
    .select()
    .from(administratorOtpChallenges)
    .where(and(
      eq(administratorOtpChallenges.email, email),
      isNull(administratorOtpChallenges.consumedAt),
    ))
    .orderBy(desc(administratorOtpChallenges.createdAt))
    .limit(1);

  const failed = async (reason: string) => {
    if (challenge && challenge.attempts + 1 >= OTP_MAX_ATTEMPTS) {
      await getAdminDatabase()
        .update(administratorOtpChallenges)
        .set({ attempts: challenge.attempts + 1, consumedAt: new Date() })
        .where(eq(administratorOtpChallenges.id, challenge.id));
    } else if (challenge) {
      await getAdminDatabase()
        .update(administratorOtpChallenges)
        .set({ attempts: challenge.attempts + 1 })
        .where(eq(administratorOtpChallenges.id, challenge.id));
    }
    await withAdminTransaction((tx) => writeAudit(tx, {
      actorAdministratorId: administrator?.id ?? null,
      action: "administrator.login_failed",
      summary: "An administrator sign-in code was rejected.",
      entityType: "administrator",
      entityId: administrator?.id ?? null,
      metadata: { reason },
      ipAddress: input.ipAddress,
    }));
    return { error: "That code is invalid or has expired." };
  };

  if (!administrator || administrator.status !== "active" || !challenge) {
    return failed("rejected");
  }
  if (challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= OTP_MAX_ATTEMPTS) {
    return failed("expired");
  }

  const actual = hashOtp(code, authSecret());
  if (!otpHashesMatch(challenge.codeHash, actual)) {
    return failed("invalid");
  }

  const token = randomBytes(32).toString("base64url");
  await withAdminTransaction(async (tx) => {
    await tx
      .update(administratorOtpChallenges)
      .set({ consumedAt: new Date() })
      .where(eq(administratorOtpChallenges.id, challenge.id));
    await tx.insert(administratorSessions).values({
      administratorId: administrator.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
    await writeAudit(tx, {
      actorAdministratorId: administrator.id,
      action: "administrator.login",
      summary: "An administrator signed in.",
      entityType: "administrator",
      entityId: administrator.id,
      ipAddress: input.ipAddress,
    });
  });

  return { token };
}

export function adminSessionCookie(token: string) {
  return {
    name: "saas_admin_session",
    value: token,
    options: sessionCookieOptions({
      secure: process.env.NODE_ENV === "production",
      maxAgeSeconds: SESSION_TTL_MS / 1000,
    }),
  };
}

export async function readAdministratorSession(token: string | undefined): Promise<AdminPrincipal | null> {
  if (!token) {
    return null;
  }
  const tokenHash = hashToken(token);
  const [session] = await getAdminDatabase()
    .select({
      sessionId: administratorSessions.id,
      administratorId: administratorSessions.administratorId,
      expiresAt: administratorSessions.expiresAt,
      revokedAt: administratorSessions.revokedAt,
      email: platformAdministrators.email,
      name: platformAdministrators.name,
      displayName: platformAdministrators.displayName,
      status: platformAdministrators.status,
    })
    .from(administratorSessions)
    .innerJoin(platformAdministrators, eq(platformAdministrators.id, administratorSessions.administratorId))
    .where(eq(administratorSessions.tokenHash, tokenHash))
    .limit(1);

  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || session.status !== "active") {
    return null;
  }

  const grants = await getAdminDatabase()
    .select({
      permission: platformPermissions.key,
      role: platformRoles.name,
    })
    .from(platformAdministratorRoles)
    .innerJoin(platformRoles, eq(platformRoles.id, platformAdministratorRoles.roleId))
    .innerJoin(platformRolePermissions, eq(platformRolePermissions.roleId, platformRoles.id))
    .innerJoin(platformPermissions, eq(platformPermissions.id, platformRolePermissions.permissionId))
    .where(eq(platformAdministratorRoles.administratorId, session.administratorId));

  return {
    sessionId: session.sessionId,
    administratorId: session.administratorId,
    email: session.email,
    name: session.name,
    displayName: session.displayName,
    permissions: [...new Set(grants.map((grant) => grant.permission))],
    roles: [...new Set(grants.map((grant) => grant.role))],
  };
}

export async function revokeSessionToken(token: string | undefined): Promise<void> {
  if (!token) {
    return;
  }
  await getAdminDatabase()
    .update(administratorSessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(administratorSessions.tokenHash, hashToken(token)),
      isNull(administratorSessions.revokedAt),
    ));
}

export async function revokeAdministratorSessions(administratorId: string): Promise<void> {
  await getAdminDatabase()
    .update(administratorSessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(administratorSessions.administratorId, administratorId),
      isNull(administratorSessions.revokedAt),
    ));
}
