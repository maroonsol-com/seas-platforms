import { connection } from "next/server";
import Link from "next/link";

import { money } from "@/components/clinic/format";
import { Pager } from "@/components/clinic/pager";
import { Button } from "@/components/ui/button";
import { requireBusiness } from "@/server/access";
import { pageNumber } from "@/server/constants";
import { listInvoices } from "@/server/invoices";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; overdue?: string; page?: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const { rows, total } = await listInvoices(ctx, {
    page,
    query: params.q,
    status: params.status,
    from: params.from,
    to: params.to,
    overdue: params.overdue === "1",
  });
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        {ctx.subscriptionAllowed ? <Button render={<Link href="/invoices/new" />}>Create invoice</Button> : null}
      </div>
      <form className="flex flex-wrap gap-2">
        <input className="h-9 min-w-48 flex-1 rounded-lg border px-3 text-sm" name="q" defaultValue={params.q} placeholder="Invoice, patient, or mobile" />
        <select className="h-9 rounded-lg border px-2 text-sm" name="status" defaultValue={params.status ?? ""}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="finalized">Finalized</option>
          <option value="partially_paid">Partially paid</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input className="h-9 rounded-lg border px-3 text-sm" type="date" name="from" defaultValue={params.from} />
        <input className="h-9 rounded-lg border px-3 text-sm" type="date" name="to" defaultValue={params.to} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="overdue" value="1" defaultChecked={params.overdue === "1"} /> Overdue</label>
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left"><tr><th className="p-3">Invoice</th><th className="p-3">Patient</th><th className="p-3">Date</th><th className="p-3">Total</th><th className="p-3">Outstanding</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="p-3"><Link className="underline" href={`/invoices/${row.id}`}>{row.invoice_number}</Link></td>
                <td className="p-3">{row.full_name}<div className="text-xs text-muted-foreground">{row.patient_number} · {row.mobile}</div></td>
                <td className="p-3">{row.invoice_date}</td>
                <td className="p-3">{money(row.total ?? "0")}</td>
                <td className="p-3">{money(row.balance ?? "0")}</td>
                <td className="p-3">{row.status}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan={6}>No invoices match this filter.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} path="/invoices" params={{ q: params.q, status: params.status, from: params.from, to: params.to, overdue: params.overdue }} />
    </div>
  );
}
