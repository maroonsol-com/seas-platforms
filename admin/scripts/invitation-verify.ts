import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

function loadEnv(file: string) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separator = trimmed.indexOf("=");
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    const key = trimmed.slice(0, separator).trim();
    process.env[key] = value;
  }
}

async function main() {
  loadEnv(path.join(import.meta.dirname, "../.env"));
  const { and, eq, gt, isNull, sql } = await import("drizzle-orm");
  const { businessProducts, businesses, invitations } = await import("../src/db/schema");
  const { closeAdminPool, withAdminTransaction } = await import("../src/db/transaction");
  const { classifyInvitation, hashInvitationToken } = await import("../src/server/invitations");
  const failures: string[] = [];

  function check(name: string, condition: boolean) {
    if (!condition) failures.push(name);
  }

  try {
    await withAdminTransaction(async (tx) => {
      const [link] = await tx
        .select({ businessId: businessProducts.businessId, productId: businessProducts.productId })
        .from(businessProducts)
        .limit(1);
      if (!link) throw new Error("No business is available for the rolled-back invitation check.");
      const [business] = await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, link.businessId)).limit(1);
      check("business exists", Boolean(business));

      const tokenHash = hashInvitationToken(`rollback-${randomUUID()}`);
      const email = `invite-rollback-${randomUUID()}@example.com`;
      const [created] = await tx.insert(invitations).values({
        businessId: link.businessId,
        productId: link.productId,
        email,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      }).returning({
        id: invitations.id,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
      });
      check("new invitation is valid", classifyInvitation(created ?? null) === "valid");
      check("expired state", classifyInvitation({ expiresAt: new Date(Date.now() - 1000), acceptedAt: null, revokedAt: null }) === "expired");
      check("revoked state", classifyInvitation({ expiresAt: new Date(Date.now() + 1000), acceptedAt: null, revokedAt: new Date() }) === "revoked");
      check("accepted state", classifyInvitation({ expiresAt: new Date(Date.now() + 1000), acceptedAt: new Date(), revokedAt: null }) === "accepted");

      const mismatch = await tx.update(invitations).set({ acceptedAt: new Date() }).where(and(
        eq(invitations.id, created!.id),
        sql`lower(${invitations.email}) = ${"someone-else@example.com"}`,
      )).returning({ id: invitations.id });
      check("email mismatch does not accept", mismatch.length === 0);

      const accepted = await tx.update(invitations).set({ acceptedAt: new Date() }).where(and(
        eq(invitations.id, created!.id),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
        sql`lower(${invitations.email}) = ${email.toLowerCase()}`,
      )).returning({ id: invitations.id });
      check("matching email accepts once", accepted.length === 1);

      const again = await tx.update(invitations).set({ acceptedAt: new Date() }).where(and(
        eq(invitations.id, created!.id),
        isNull(invitations.acceptedAt),
      )).returning({ id: invitations.id });
      check("accepted invitation cannot be accepted again", again.length === 0);
      throw new Error("ROLLBACK");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "ROLLBACK") {
      const message = error instanceof Error ? error.message : "Invitation check failed.";
      console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
      failures.push("transaction");
    }
  }

  await closeAdminPool();
  if (failures.length > 0) {
    console.error(failures.join(", "));
    process.exit(1);
  }
  console.log("Invitation verification passed.");
}

main();
