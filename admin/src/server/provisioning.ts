import { createHash, randomBytes } from "node:crypto";

import {
  SERVICE_SIGNATURE_HEADER,
  SERVICE_TIMESTAMP_HEADER,
  signServiceRequest,
} from "@saas/auth-core";
import { and, eq, isNull } from "drizzle-orm";

import { getAdminDatabase, withAdminTransaction } from "@/db/transaction";
import {
  businessProducts,
  businessProvisioning,
  businesses,
  invitations,
  productIntegrationConfigs,
  saasProducts,
  subscriptionPlans,
} from "@/db/schema";

import { authorize, writeAudit } from "./audit";
import { AdminError } from "./errors";
import { sendEmail } from "./mail";
import { assignSubscription } from "./subscriptions";

type ProvisionBody = {
  idempotencyKey: string;
  platformBusinessId: string;
  legalName: string;
  displayName: string;
  timezone: string;
  ownerName: string;
  ownerEmail: string;
  ownerMobile: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
};

function secretValue(name: string | null): string {
  if (!name) {
    throw new AdminError("The product has no provisioning secret variable configured.");
  }
  const value = process.env[name]?.trim() ?? "";
  if (value.length === 0) {
    throw new AdminError(`The ${name} environment variable is not set. Provisioning was not sent.`);
  }
  return value;
}

async function signedPost(url: string, secret: string, payload: unknown): Promise<Response> {
  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [SERVICE_TIMESTAMP_HEADER]: timestamp,
      [SERVICE_SIGNATURE_HEADER]: signServiceRequest(secret, timestamp, body),
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
}

export async function provisionBusiness(actorId: string, businessId: string) {
  await authorize(actorId, "provisioning.retry");
  const context = await loadProvisionContext(businessId);
  if (context.provisioning.status === "succeeded" && context.provisioning.productBusinessId) {
    await finishAfterProvision(actorId, context, context.provisioning.productBusinessId);
    return { status: "succeeded" as const, productBusinessId: context.provisioning.productBusinessId };
  }
  if (!context.integration.provisioningUrl) {
    throw new AdminError("The product provisioning URL is not configured.");
  }

  await withAdminTransaction(async (tx) => {
    await tx.update(businessProvisioning).set({
      status: "in_progress",
      attemptCount: context.provisioning.attemptCount + 1,
      lastAttemptedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(businessProvisioning.id, context.provisioning.id));
    await writeAudit(tx, {
      actorAdministratorId: actorId,
      action: "provisioning.started",
      summary: "Business provisioning started.",
      entityType: "business",
      entityId: businessId,
      businessId,
      productId: context.product.id,
    });
  });

  const payload: ProvisionBody = {
    idempotencyKey: context.provisioning.idempotencyKey,
    platformBusinessId: businessId,
    legalName: context.business.legalName,
    displayName: context.business.displayName,
    timezone: context.business.timezone,
    ownerName: context.business.ownerName,
    ownerEmail: context.business.ownerEmail,
    ownerMobile: context.business.ownerMobile,
    addressLine1: context.business.addressLine1,
    city: context.business.city,
    state: context.business.state,
    postalCode: context.business.postalCode,
  };

  let productBusinessId: string;
  try {
    const secret = secretValue(context.integration.secretEnvVar);
    const response = await signedPost(context.integration.provisioningUrl, secret, payload);
    const body = await response.json().catch(() => null) as { productBusinessId?: string; error?: string; detail?: string } | null;
    if (!response.ok || !body?.productBusinessId) {
      const detail = body?.detail ? ` ${body.detail}` : "";
      throw new AdminError(`${body?.error || "The clinic application rejected provisioning."}${detail}`.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]").slice(0, 300));
    }
    productBusinessId = body.productBusinessId;
  } catch (error) {
    const message = error instanceof AdminError ? error.message : "The clinic application could not be reached.";
    await withAdminTransaction(async (tx) => {
      await tx.update(businessProvisioning).set({
        status: "failed",
        lastError: message.slice(0, 500),
        updatedAt: new Date(),
      }).where(eq(businessProvisioning.id, context.provisioning.id));
      await writeAudit(tx, {
        actorAdministratorId: actorId,
        action: "provisioning.failed",
        summary: "Business provisioning failed.",
        entityType: "business",
        entityId: businessId,
        businessId,
        productId: context.product.id,
        metadata: { reason: message.slice(0, 200) },
      });
    });
    throw new AdminError(message);
  }

  await withAdminTransaction(async (tx) => {
    await tx.update(businessProvisioning).set({
      status: "succeeded",
      productBusinessId,
      succeededAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(businessProvisioning.id, context.provisioning.id));
    if (context.business.status === "provisioning_pending") {
      await tx.update(businesses).set({ status: "active", updatedAt: new Date() }).where(eq(businesses.id, businessId));
    }
    await writeAudit(tx, {
      actorAdministratorId: actorId,
      action: "provisioning.succeeded",
      summary: "The clinic application provisioned the business.",
      entityType: "business",
      entityId: businessId,
      businessId,
      productId: context.product.id,
      metadata: { productBusinessId },
    });
  });

  try {
    await finishAfterProvision(actorId, context, productBusinessId);
  } catch (error) {
    const message = error instanceof AdminError ? error.message : "Provisioning succeeded, but the follow-up step failed.";
    await getAdminDatabase().update(businessProvisioning).set({
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    }).where(eq(businessProvisioning.id, context.provisioning.id));
    throw new AdminError(message);
  }

  return { status: "succeeded" as const, productBusinessId };
}

async function finishAfterProvision(
  actorId: string,
  context: Awaited<ReturnType<typeof loadProvisionContext>>,
  productBusinessId: string,
) {
  if (context.provisioning.requestedPlanId && context.provisioning.requestedStartsOn && context.provisioning.requestedExpiresOn) {
    await assignSubscription({
      actorId,
      businessId: context.business.id,
      planId: context.provisioning.requestedPlanId,
      startsOn: context.provisioning.requestedStartsOn,
      expiresOn: context.provisioning.requestedExpiresOn,
      status: "active",
    });
  }
  await createOwnerInvitation(actorId, context);
  await pushEntitlement(context.business.id, productBusinessId);
}

async function createOwnerInvitation(
  actorId: string,
  context: Awaited<ReturnType<typeof loadProvisionContext>>,
) {
  const [existing] = await getAdminDatabase()
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(
      eq(invitations.businessId, context.business.id),
      eq(invitations.email, context.business.ownerEmail),
      isNull(invitations.revokedAt),
    ))
    .limit(1);
  if (existing) {
    return;
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("base64url");
  const clinicBase = (context.product.productUrl || process.env.CLINIC_APP_URL || "").trim().replace(/\/$/, "");
  const link = clinicBase ? `${clinicBase}/invite?token=${token}` : null;
  let sentAt: Date | null = null;
  if (link) {
    const delivery = await sendEmail({
      to: context.business.ownerEmail,
      subject: `Invitation to ${context.business.displayName}`,
      text: `You have been invited to ${context.business.displayName}. Open this link to continue: ${link}`,
    });
    sentAt = delivery === "sent" ? new Date() : null;
  }

  await withAdminTransaction(async (tx) => {
    await tx.insert(invitations).values({
      businessId: context.business.id,
      productId: context.product.id,
      email: context.business.ownerEmail,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      sentAt,
    });
    await writeAudit(tx, {
      actorAdministratorId: actorId,
      action: "invitation.created",
      summary: sentAt ? "An owner invitation email was sent." : "An owner invitation was stored. Email was not sent.",
      entityType: "invitation",
      businessId: context.business.id,
      productId: context.product.id,
    });
  });
}

export async function pushEntitlement(businessId: string, productBusinessId: string) {
  const context = await loadProvisionContext(businessId);
  if (!context.integration.entitlementUrl || !context.integration.secretEnvVar) {
    return "skipped" as const;
  }
  const secret = process.env[context.integration.secretEnvVar]?.trim();
  if (!secret) {
    return "skipped" as const;
  }
  const { getCurrentSubscription } = await import("./subscriptions");
  const current = await getCurrentSubscription(businessId);
  if (!current) {
    return "skipped" as const;
  }
  try {
    const response = await signedPost(context.integration.entitlementUrl, secret, {
      productBusinessId,
      status: current.status,
      planName: current.planName,
      startsOn: current.startsOn,
      expiresOn: current.expiresOn,
      timezone: current.timezone,
    });
    if (!response.ok) {
      throw new Error("rejected");
    }
    return "synced" as const;
  } catch {
    await withAdminTransaction((tx) => writeAudit(tx, {
      actorAdministratorId: null,
      action: "entitlement.push_failed",
      summary: "The clinic subscription snapshot was not updated.",
      entityType: "business",
      entityId: businessId,
      businessId,
    }));
    return "failed" as const;
  }
}

async function loadProvisionContext(businessId: string) {
  const [business] = await getAdminDatabase().select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const [link] = await getAdminDatabase().select().from(businessProducts).where(eq(businessProducts.businessId, businessId)).limit(1);
  const [product] = link
    ? await getAdminDatabase().select().from(saasProducts).where(eq(saasProducts.id, link.productId)).limit(1)
    : [];
  const [integration] = link
    ? await getAdminDatabase().select().from(productIntegrationConfigs).where(eq(productIntegrationConfigs.productId, link.productId)).limit(1)
    : [];
  const [provisioning] = await getAdminDatabase().select().from(businessProvisioning).where(eq(businessProvisioning.businessId, businessId)).limit(1);
  if (!business || !product || !integration || !provisioning) {
    throw new AdminError("This business is not ready to provision.");
  }
  return { business, product, integration, provisioning };
}

export async function planName(planId: string | null) {
  if (!planId) {
    return null;
  }
  const [plan] = await getAdminDatabase().select({ name: subscriptionPlans.name }).from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);
  return plan?.name ?? null;
}
