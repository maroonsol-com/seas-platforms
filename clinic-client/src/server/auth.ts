import { createHash, randomBytes } from "node:crypto";

import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  generateOtpCode,
  hashOtp,
  otpHashesMatch,
} from "@saas/auth-core";
import { subscriptionAccessAllowed } from "@saas/shared";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { queryRows } from "@/db/rows";
import {
  branchMemberships,
  branches,
  businessMemberships,
  businesses,
  membershipRoles,
  permissions,
  rolePermissions,
  roles,
  subscriptionSnapshots,
  userOtpChallenges,
  userSessions,
  users,
} from "@/db/schema";
import { withServiceRoleTransaction, withTenantTransaction, withUserTransaction } from "@/db/tenant-transaction";

import { isSmtpConfigured, sendEmail } from "./mail";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type ClinicPrincipal = {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  businessId: string | null;
  businessName: string | null;
  timezone: string;
  permissions: string[];
  branchIds: string[];
  subscriptionAllowed: boolean;
  businessStatus: string | null;
};

export type MembershipChoice = {
  businessId: string;
  displayName: string;
  legalName: string;
  status: string;
};

function authSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim() ?? "";
  if (secret.length === 0) throw new Error("AUTH_SECRET is not configured.");
  return secret;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export type OtpRequestResult = "accepted" | "not_configured" | "delivery_failed";

export async function requestClinicOtp(emailInput: string): Promise<OtpRequestResult> {
  if (!isSmtpConfigured()) return "not_configured";
  const email = emailInput.trim().toLowerCase();
  const user = await withServiceRoleTransaction(async (tx) => {
    const [row] = await tx.select({ id: users.id, status: users.status }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    return row ?? null;
  });
  if (!user || user.status !== "active") return "accepted";

  const now = new Date();
  const outcome = await withServiceRoleTransaction(async (tx) => {
    const recent = await tx
      .select({ id: userOtpChallenges.id })
      .from(userOtpChallenges)
      .where(and(
        eq(userOtpChallenges.email, email),
        isNull(userOtpChallenges.consumedAt),
        gt(userOtpChallenges.sentAt, new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS)),
      ))
      .limit(1);
    if (recent.length > 0) return "cooldown" as const;
    const hourly = await tx
      .select({ id: userOtpChallenges.id })
      .from(userOtpChallenges)
      .where(and(eq(userOtpChallenges.email, email), gt(userOtpChallenges.createdAt, new Date(now.getTime() - 60 * 60 * 1000))));
    if (hourly.length >= 5) return "capped" as const;
    const code = generateOtpCode();
    const [challenge] = await tx.insert(userOtpChallenges).values({
      email,
      codeHash: hashOtp(code, authSecret()),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      sentAt: now,
    }).returning({ id: userOtpChallenges.id });
    return { challengeId: challenge?.id, code };
  });

  if (outcome === "cooldown" || outcome === "capped" || !outcome.challengeId) return "accepted";
  const delivery = await sendEmail({
    to: email,
    subject: "Your clinic sign-in code",
    text: `Your sign-in code is ${outcome.code}. It expires in 5 minutes.`,
  });
  if (delivery !== "sent") {
    await withServiceRoleTransaction(async (tx) => {
      await tx.delete(userOtpChallenges).where(eq(userOtpChallenges.id, outcome.challengeId!));
    });
    return delivery === "not_configured" ? "not_configured" : "delivery_failed";
  }
  return "accepted";
}

export async function verifyClinicOtp(emailInput: string, code: string): Promise<{ token: string; businesses: MembershipChoice[] } | null> {
  const email = emailInput.trim().toLowerCase();
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) return null;

  const verified = await withServiceRoleTransaction(async (tx) => {
    const [challenge] = await tx
      .select()
      .from(userOtpChallenges)
      .where(and(eq(userOtpChallenges.email, email), isNull(userOtpChallenges.consumedAt)))
      .orderBy(desc(userOtpChallenges.createdAt))
      .limit(1);
    if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
      if (challenge) {
        await tx.update(userOtpChallenges).set({ consumedAt: new Date() }).where(eq(userOtpChallenges.id, challenge.id));
      }
      return null;
    }
    if (!otpHashesMatch(hashOtp(normalized, authSecret()), challenge.codeHash)) {
      const attempts = challenge.attempts + 1;
      await tx.update(userOtpChallenges).set({
        attempts,
        consumedAt: attempts >= OTP_MAX_ATTEMPTS ? new Date() : null,
      }).where(eq(userOtpChallenges.id, challenge.id));
      return null;
    }
    const [user] = await tx.select().from(users).where(and(sql`lower(${users.email}) = ${email}`, eq(users.status, "active"))).limit(1);
    if (!user) return null;
    await tx.update(userOtpChallenges).set({ consumedAt: new Date() }).where(eq(userOtpChallenges.id, challenge.id));
    const token = randomBytes(32).toString("base64url");
    const [session] = await tx.insert(userSessions).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    }).returning({ id: userSessions.id });
    return { token, userId: user.id, sessionId: session?.id ?? "" };
  });
  if (!verified) return null;

  const choices = await listMemberships(verified.userId);
  if (choices.length === 1 && choices[0]) {
    await selectClinicBusiness(verified.token, choices[0].businessId);
  }
  return { token: verified.token, businesses: choices };
}

export async function listMemberships(userId: string): Promise<MembershipChoice[]> {
  return withUserTransaction(userId, async (tx) => {
    return tx
      .select({
        businessId: businesses.id,
        displayName: businesses.displayName,
        legalName: businesses.legalName,
        status: businesses.status,
      })
      .from(businessMemberships)
      .innerJoin(businesses, eq(businesses.id, businessMemberships.businessId))
      .where(and(eq(businessMemberships.userId, userId), eq(businessMemberships.status, "active")));
  });
}

export async function selectClinicBusiness(token: string, businessId: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const session = await withServiceRoleTransaction(async (tx) => {
    const [row] = await tx.select().from(userSessions).where(eq(userSessions.tokenHash, tokenHash)).limit(1);
    return row ?? null;
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return false;
  const choices = await listMemberships(session.userId);
  if (!choices.some((choice) => choice.businessId === businessId)) return false;
  await withServiceRoleTransaction(async (tx) => {
    await tx.update(userSessions).set({ businessId }).where(eq(userSessions.id, session.id));
  });
  return true;
}

export async function revokeClinicToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await withServiceRoleTransaction(async (tx) => {
    await tx.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.tokenHash, tokenHash), isNull(userSessions.revokedAt)));
  });
}

export async function readClinicPrincipal(token: string): Promise<ClinicPrincipal | null> {
  const tokenHash = hashToken(token);
  const session = await withServiceRoleTransaction(async (tx) => {
    const [row] = await tx
      .select({
        sessionId: userSessions.id,
        userId: users.id,
        email: users.email,
        name: users.name,
        userStatus: users.status,
        businessId: userSessions.businessId,
        expiresAt: userSessions.expiresAt,
        revokedAt: userSessions.revokedAt,
      })
      .from(userSessions)
      .innerJoin(users, eq(users.id, userSessions.userId))
      .where(eq(userSessions.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || session.userStatus !== "active") {
    return null;
  }
  const base: ClinicPrincipal = {
    sessionId: session.sessionId,
    userId: session.userId,
    email: session.email,
    name: session.name,
    businessId: null,
    businessName: null,
    timezone: "Asia/Kolkata",
    permissions: [],
    branchIds: [],
    subscriptionAllowed: false,
    businessStatus: null,
  };
  if (!session.businessId) return base;

  const allowed = (await listMemberships(session.userId)).some((choice) => choice.businessId === session.businessId);
  if (!allowed) return base;

  return withTenantTransaction(session.businessId, async (tx) => {
    const [business] = await tx.select().from(businesses).where(eq(businesses.id, session.businessId!)).limit(1);
    if (!business) return base;
    const [membership] = await tx
      .select({ id: businessMemberships.id })
      .from(businessMemberships)
      .where(and(
        eq(businessMemberships.businessId, business.id),
        eq(businessMemberships.userId, session.userId),
        eq(businessMemberships.status, "active"),
      ))
      .limit(1);
    const permissionRows = membership
      ? await tx
        .select({ key: permissions.key })
        .from(membershipRoles)
        .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(membershipRoles.membershipId, membership.id))
      : [];
    const assignedBranches = membership
      ? await tx.select({ branchId: branchMemberships.branchId }).from(branchMemberships).where(eq(branchMemberships.membershipId, membership.id))
      : [];
    const activeBranches = await tx.select({ id: branches.id }).from(branches).where(eq(branches.status, "active"));
    const branchIds = assignedBranches.length > 0
      ? activeBranches.map((branch) => branch.id).filter((id) => assignedBranches.some((row) => row.branchId === id))
      : activeBranches.map((branch) => branch.id);
    const [snapshot] = await tx.select().from(subscriptionSnapshots).where(eq(subscriptionSnapshots.businessId, business.id)).limit(1);
    const subscriptionAllowed = business.status === "active" && Boolean(snapshot) && subscriptionAccessAllowed({
      status: snapshot?.status ?? "",
      expiresOn: snapshot?.expiresOn ?? "",
      timezone: snapshot?.timezone || business.timezone,
    });
    return {
      ...base,
      businessId: business.id,
      businessName: business.displayName,
      timezone: business.timezone,
      permissions: [...new Set(permissionRows.map((row) => row.key))],
      branchIds,
      subscriptionAllowed,
      businessStatus: business.status,
    };
  }, session.userId);
}

export function sessionMaxAgeSeconds(): number {
  return SESSION_TTL_MS / 1000;
}

export async function countChallengesForTests(email: string): Promise<number> {
  const rows = await withServiceRoleTransaction(async (tx) => queryRows<{ count: string }>(tx, sql`
    select count(*)::text as count from user_otp_challenges where email = ${email} and consumed_at is null
  `));
  return Number(rows[0]?.count ?? 0);
}
