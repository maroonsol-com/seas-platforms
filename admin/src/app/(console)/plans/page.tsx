import { connection } from "next/server";

import Link from "next/link";

import { PageSuspense } from "@/components/admin/page-suspense";
import { Pager } from "@/components/admin/pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listPlans } from "@/server/plans";
import { pageNumber } from "@/server/validate";

export const instant = false;

const cycleLabels: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  yearly: "Annual",
  custom: "Custom",
};

export default function PlansPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return (
    <PageSuspense>
      <PlansContent searchParams={searchParams} />
    </PageSuspense>
  );
}

async function PlansContent({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await connection();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const { rows, total } = await listPlans(page);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Plans</h1>
          <p className="text-sm text-muted-foreground">Prices are entered by an administrator. No default Clinic price is configured.</p>
        </div>
        <Button render={<Link href="/plans/new" />}>New plan</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left"><tr><th className="p-3">Plan</th><th className="p-3">Product</th><th className="p-3">Price</th><th className="p-3">Cycle</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {rows.map((plan) => (
              <tr key={plan.id} className="border-b last:border-0">
                <td className="p-3"><Link className="underline" href={`/plans/${plan.id}`}>{plan.name}</Link></td>
                <td className="p-3">{plan.productName}</td>
                <td className="p-3">{plan.currency} {plan.price}</td>
                <td className="p-3">{cycleLabels[plan.billingCycle] ?? plan.billingCycle}</td>
                <td className="p-3"><Badge variant="secondary">{plan.status}</Badge></td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan={5}>No plans yet. Add pricing before assigning a subscription.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} path="/plans" />
    </div>
  );
}
