import { connection } from "next/server";

import { money } from "@/components/clinic/format";
import { Button } from "@/components/ui/button";
import { requireBusiness, requireSubscription } from "@/server/access";
import { financeSummary } from "@/server/reports";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  const params = await searchParams;
  const summary = await financeSummary(ctx, params);
  const rows = [
    ["Gross invoiced", money(summary.gross)],
    ["Discounts", money(summary.discounts)],
    ["Tax", money(summary.tax)],
    ["Net invoice value", money(summary.net)],
    ["Payments received", money(summary.collected)],
    ["Refunds", money(summary.refunds)],
    ["Credit notes", money(summary.creditNotes)],
    ["Outstanding receivables", money(summary.outstanding)],
    ["Customer credit", money(summary.customerCredit)],
    ["Overdue invoices", String(summary.overdueCount)],
  ];
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="text-sm text-muted-foreground">These figures separate billed value from money collected. Profit is not shown because expenses and inventory are not part of this release.</p>
      <form className="flex flex-wrap gap-2">
        <input className="h-9 rounded-lg border px-3 text-sm" type="date" name="from" defaultValue={params.from} />
        <input className="h-9 rounded-lg border px-3 text-sm" type="date" name="to" defaultValue={params.to} />
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) => <div key={label} className="rounded-xl border bg-background p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-xl font-semibold">{value}</dd></div>)}
      </dl>
      <section className="rounded-xl border bg-background p-4">
        <h2 className="font-semibold">Payment methods</h2>
        <ul className="mt-2 text-sm">{summary.methods.map((method) => <li key={method.method}>{method.method}: {money(method.amount)}</li>)}</ul>
      </section>
    </div>
  );
}
