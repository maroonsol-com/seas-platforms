import { count, desc } from "drizzle-orm";

import { getAdminDatabase } from "@/db/transaction";
import { platformAuditLogs } from "@/db/schema";

import { PAGE_SIZE } from "./constants";

export async function listAuditLogs(page: number) {
  const database = getAdminDatabase();
  const current = Math.max(1, page);
  const [total] = await database.select({ value: count() }).from(platformAuditLogs);
  const rows = await database
    .select({
      id: platformAuditLogs.id,
      action: platformAuditLogs.action,
      entityType: platformAuditLogs.entityType,
      createdAt: platformAuditLogs.createdAt,
      actorAdministratorId: platformAuditLogs.actorAdministratorId,
    })
    .from(platformAuditLogs)
    .orderBy(desc(platformAuditLogs.createdAt), desc(platformAuditLogs.id))
    .limit(PAGE_SIZE)
    .offset((current - 1) * PAGE_SIZE);
  return { rows, total: total?.value ?? 0 };
}
