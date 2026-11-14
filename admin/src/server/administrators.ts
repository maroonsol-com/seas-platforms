import { and, count, eq, inArray, sql } from "drizzle-orm";

import { getAdminDatabase, withAdminTransaction } from "@/db/transaction";
import {
  platformAdministratorRoles,
  platformAdministrators,
  platformRoles,
} from "@/db/schema";

import { authorize, countOtherActiveSuperAdmins, writeAudit } from "./audit";
import { sendEmail } from "./mail";
import { PAGE_SIZE, SUPER_ADMIN_ROLE } from "./constants";
import { AdminError } from "./errors";
import { revokeAdministratorSessions } from "./auth";

export async function listAdministrators(page = 1) {
  const current = Math.max(1, page);
  const database = getAdminDatabase();
  const [total] = await database.select({ value: count() }).from(platformAdministrators);
  const ids = await database
    .select({ id: platformAdministrators.id })
    .from(platformAdministrators)
    .orderBy(platformAdministrators.name, platformAdministrators.id)
    .limit(PAGE_SIZE)
    .offset((current - 1) * PAGE_SIZE);
  if (ids.length === 0) return { rows: [], total: total?.value ?? 0 };
  const rows = await database
    .select({
      id: platformAdministrators.id,
      name: platformAdministrators.name,
      displayName: platformAdministrators.displayName,
      email: platformAdministrators.email,
      status: platformAdministrators.status,
      role: platformRoles.name,
    })
    .from(platformAdministrators)
    .leftJoin(platformAdministratorRoles, eq(platformAdministratorRoles.administratorId, platformAdministrators.id))
    .leftJoin(platformRoles, eq(platformRoles.id, platformAdministratorRoles.roleId))
    .where(inArray(platformAdministrators.id, ids.map((row) => row.id)))
    .orderBy(platformAdministrators.name);

  const grouped = new Map<string, { id: string; name: string; email: string; status: string; roles: string[] }>();
  for (const row of rows) {
    const administrator = grouped.get(row.id) ?? {
      id: row.id,
      name: row.displayName || row.name,
      email: row.email,
      status: row.status,
      roles: [],
    };
    if (row.role) {
      administrator.roles.push(row.role);
    }
    grouped.set(row.id, administrator);
  }
  return { rows: ids.flatMap((row) => grouped.get(row.id) ?? []), total: total?.value ?? 0 };
}

export async function listRoles() {
  return getAdminDatabase().select({ id: platformRoles.id, name: platformRoles.name }).from(platformRoles).orderBy(platformRoles.name);
}

export async function inviteAdministrator(input: {
  actorId: string;
  name: string;
  email: string;
  roleId: string;
}) {
  await authorize(input.actorId, "administrators.write");
  const administratorId = await withAdminTransaction(async (tx) => {
    const [existing] = await tx
      .select({ id: platformAdministrators.id })
      .from(platformAdministrators)
      .where(eq(platformAdministrators.email, input.email))
      .limit(1);
    const administratorId = existing?.id ?? (await tx.insert(platformAdministrators).values({
      email: input.email,
      name: input.name,
      displayName: input.name,
      status: "active",
    }).returning({ id: platformAdministrators.id }))[0]?.id;
    if (!administratorId) {
      throw new AdminError("The administrator could not be saved.");
    }
    await tx.insert(platformAdministratorRoles).values({
      administratorId,
      roleId: input.roleId,
      assignedBy: input.actorId,
    }).onConflictDoNothing();
    await writeAudit(tx, {
      actorAdministratorId: input.actorId,
      action: "administrator.role_assigned",
      summary: existing ? "An administrator role was assigned." : "An administrator was invited.",
      entityType: "administrator",
      entityId: administratorId,
    });
    return administratorId;
  });
  const signIn = process.env.APP_URL?.replace(/\/$/, "");
  await sendEmail({
    to: input.email,
    subject: "Your admin console access",
    text: signIn
      ? `An administrator account is ready. Sign in at ${signIn}/login with this email address. Request a one-time code there. This message is not the code.`
      : "An administrator account is ready. Sign in with this email address and request a one-time code. This message is not the code.",
  });
  return administratorId;
}

export async function setAdministratorStatus(actorId: string, administratorId: string, status: "active" | "disabled") {
  await authorize(actorId, "administrators.write");
  await withAdminTransaction(async (tx) => {
    if (status === "disabled") {
      const [role] = await tx
        .select({ name: platformRoles.name })
        .from(platformAdministratorRoles)
        .innerJoin(platformRoles, eq(platformRoles.id, platformAdministratorRoles.roleId))
        .where(and(
          eq(platformAdministratorRoles.administratorId, administratorId),
          eq(platformRoles.name, SUPER_ADMIN_ROLE),
        ))
        .limit(1);
      if (role && await countOtherActiveSuperAdmins(tx, administratorId) === 0) {
        throw new AdminError("The last active Super Admin cannot be disabled.");
      }
    }
    await tx.update(platformAdministrators).set({
      status,
      disabledAt: status === "disabled" ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(platformAdministrators.id, administratorId));
    await writeAudit(tx, {
      actorAdministratorId: actorId,
      action: status === "disabled" ? "administrator.disabled" : "administrator.enabled",
      summary: status === "disabled" ? "An administrator was disabled." : "An administrator was enabled.",
      entityType: "administrator",
      entityId: administratorId,
    });
  });
  if (status === "disabled") {
    await revokeAdministratorSessions(administratorId);
  }
}

export async function removeAdministratorRole(actorId: string, administratorId: string, roleId: string) {
  await authorize(actorId, "administrators.write");
  await withAdminTransaction(async (tx) => {
    const [role] = await tx.select({ name: platformRoles.name }).from(platformRoles).where(eq(platformRoles.id, roleId)).limit(1);
    if (role?.name === SUPER_ADMIN_ROLE && await countOtherActiveSuperAdmins(tx, administratorId) === 0) {
      throw new AdminError("The last Super Admin role cannot be removed.");
    }
    await tx.delete(platformAdministratorRoles).where(and(
      eq(platformAdministratorRoles.administratorId, administratorId),
      eq(platformAdministratorRoles.roleId, roleId),
    ));
    await writeAudit(tx, {
      actorAdministratorId: actorId,
      action: "administrator.role_revoked",
      summary: "An administrator role was removed.",
      entityType: "administrator",
      entityId: administratorId,
      metadata: { role: role?.name ?? roleId },
    });
  });
}

export async function activeAdministratorCount() {
  const [row] = await getAdminDatabase()
    .select({ value: sql<number>`count(*)::int` })
    .from(platformAdministrators)
    .where(eq(platformAdministrators.status, "active"));
  return row?.value ?? 0;
}
