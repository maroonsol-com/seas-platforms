import { and, eq, sql } from "drizzle-orm";

import type { AdminTransaction } from "@/db/transaction";
import { withAdminTransaction } from "@/db/transaction";
import {
  administrativeActivityLogs,
  platformAdministratorRoles,
  platformAdministrators,
  platformAuditLogs,
  platformPermissions,
  platformRolePermissions,
  platformRoles,
} from "@/db/schema";

import { AdminError } from "./errors";

export async function writeAudit(
  tx: AdminTransaction,
  input: {
    actorAdministratorId?: string | null;
    action: string;
    summary: string;
    entityType: string;
    entityId?: string | null;
    businessId?: string | null;
    productId?: string | null;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
  },
): Promise<void> {
  await tx.insert(platformAuditLogs).values({
    actorAdministratorId: input.actorAdministratorId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    businessId: input.businessId ?? null,
    productId: input.productId ?? null,
    metadata: input.metadata ?? {},
    ipAddress: input.ipAddress ?? null,
  });
  await tx.insert(administrativeActivityLogs).values({
    actorAdministratorId: input.actorAdministratorId ?? null,
    summary: input.summary,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
  });
}

export async function authorize(administratorId: string, permission: string): Promise<void> {
  const allowed = await withAdminTransaction(async (tx) => {
    const [row] = await tx
      .select({ key: platformPermissions.key })
      .from(platformAdministratorRoles)
      .innerJoin(platformRoles, eq(platformRoles.id, platformAdministratorRoles.roleId))
      .innerJoin(platformRolePermissions, eq(platformRolePermissions.roleId, platformRoles.id))
      .innerJoin(platformPermissions, eq(platformPermissions.id, platformRolePermissions.permissionId))
      .where(and(
        eq(platformAdministratorRoles.administratorId, administratorId),
        eq(platformPermissions.key, permission),
      ))
      .limit(1);
    return Boolean(row);
  });

  if (!allowed) {
    throw new AdminError("You do not have permission for this action.");
  }
}

export async function countOtherActiveSuperAdmins(
  tx: AdminTransaction,
  administratorId: string,
): Promise<number> {
  const [row] = await tx
    .select({
      value: sql<number>`count(distinct ${platformAdministrators.id})::int`,
    })
    .from(platformAdministrators)
    .innerJoin(
      platformAdministratorRoles,
      eq(platformAdministratorRoles.administratorId, platformAdministrators.id),
    )
    .innerJoin(platformRoles, eq(platformRoles.id, platformAdministratorRoles.roleId))
    .where(and(
      eq(platformRoles.name, "SUPER_ADMIN"),
      eq(platformAdministrators.status, "active"),
      sql`${platformAdministrators.id} <> ${administratorId}`,
    ));

  return row?.value ?? 0;
}
