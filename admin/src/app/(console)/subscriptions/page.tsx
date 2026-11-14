import { connection } from "next/server";

import Link from "next/link";

import { PageSuspense } from "@/components/admin/page-suspense";
import { Pager } from "@/components/admin/pager";
import { Badge } from "@/components/ui/badge";
import { listSubscriptions } from "@/server/subscriptions";
import { pageNumber } from "@/server/validate";

export const instant = false;

export default function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return (
    <PageSuspense>
      <SubscriptionsContent searchParams={searchParams} />
    </PageSuspense>
  );
}

async function SubscriptionsContent({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await connection();
  const page = pageNumber((await searchParams).page);
  const { rows, total } = await listSubscriptions(page);
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Subscriptions</h1>
      <p className="text-sm text-muted-foreground">Access lasts through the expiry date. Suspension takes effect immediately. Renewal is a separate action from recording a payment.</p>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left"><tr><th className="p-3">Business</th><th className="p-3">Plan</th><th className="p-3">Status</th><th className="p-3">Expires</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="p-3"><Link className="underline" href={`/businesses/${row.businessId}`}>{row.businessName}</Link></td>
                <td className="p-3">{row.planName}</td>
                <td className="p-3"><Badge variant="secondary">{row.status}</Badge></td>
                <td className="p-3">{row.expiresOn}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan={4}>No subscriptions yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} path="/subscriptions" />
    </div>
  );
}
