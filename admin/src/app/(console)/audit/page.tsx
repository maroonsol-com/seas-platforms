import { connection } from "next/server";

import { PageSuspense } from "@/components/admin/page-suspense";
import { Pager } from "@/components/admin/pager";
import { listAuditLogs } from "@/server/audit-log";
import { pageNumber } from "@/server/validate";

export const instant = false;

export default function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return (
    <PageSuspense>
      <AuditContent searchParams={searchParams} />
    </PageSuspense>
  );
}

async function AuditContent({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await connection();
  const page = pageNumber((await searchParams).page);
  const { rows, total } = await listAuditLogs(page);
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit logs</h1>
        <p className="text-sm text-muted-foreground">Audit records cannot be edited or deleted from the application.</p>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left"><tr><th className="p-3">When</th><th className="p-3">Action</th><th className="p-3">Entity</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="p-3">{row.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                <td className="p-3">{row.action}</td>
                <td className="p-3">{row.entityType}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan={3}>No audit records yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} path="/audit" />
    </div>
  );
}
