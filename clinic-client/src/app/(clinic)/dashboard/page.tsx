import { connection } from "next/server";
import Link from "next/link";

import { money } from "@/components/clinic/format";
import { Button } from "@/components/ui/button";
import { requireBusiness, requireSubscription } from "@/server/access";
import { financeSummary } from "@/server/reports";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  const params = await searchParams;
  const summary = await financeSummary(ctx, { from: params.from, to: params.to });
  const cards = [
    ["Patients", String(summary.patientCount)],
    ["Invoices", String(summary.invoiceCount)],
    ["Today's invoices", String(summary.todayInvoices)],
    ["Today's collections", money(summary.todayCollected)],
    ["Invoiced value", money(summary.net)],
    ["Collected", money(summary.collected)],
    ["Outstanding", money(summary.outstanding)],
    ["Credit notes", money(summary.creditNotes)],
    ["Customer credit", money(summary.customerCredit)],
    ["Drafts", String(summary.draftCount)],
    ["Overdue", String(summary.overdueCount)],
    ["Refunds", money(summary.refunds)],
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Invoiced value is what was billed. Collected is money received. Outstanding is still owed.</p>
        </div>
        <Button render={<Link href="/invoices/new" />}>Create invoice</Button>
      </div>
      <form className="flex flex-wrap gap-2">
        <input className="h-9 rounded-lg border px-3 text-sm" type="date" name="from" defaultValue={params.from} />
        <input className="h-9 rounded-lg border px-3 text-sm" type="date" name="to" defaultValue={params.to} />
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-background p-4">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-1 text-xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-background p-4">
          <h2 className="font-semibold">Recent invoices</h2>
          {summary.recentInvoices.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No invoices yet.</p> : (
            <ul className="mt-2 grid gap-2 text-sm">
              {summary.recentInvoices.map((row) => <li key={row.invoice_number}>{row.invoice_number} · {row.full_name} · {money(row.total ?? "0")} · {row.status}</li>)}
            </ul>
          )}
        </section>
        <section className="rounded-xl border bg-background p-4">
          <h2 className="font-semibold">Recent payments</h2>
          {summary.recentPayments.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No payments yet.</p> : (
            <ul className="mt-2 grid gap-2 text-sm">
              {summary.recentPayments.map((row) => <li key={row.receipt_number}>{row.receipt_number} · {row.invoice_number} · {money(row.amount ?? "0")} · {row.method}</li>)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
