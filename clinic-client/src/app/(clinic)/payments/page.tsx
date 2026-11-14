import { connection } from "next/server";
import Link from "next/link";

import { money } from "@/components/clinic/format";
import { Pager } from "@/components/clinic/pager";
import { Button } from "@/components/ui/button";
import { requireBusiness } from "@/server/access";
import { pageNumber } from "@/server/constants";
import { listPayments } from "@/server/payments";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const { rows, total } = await listPayments(ctx, page, params.q);
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Payments and receipts</h1>
      <form className="flex gap-2"><input className="h-9 flex-1 rounded-lg border px-3 text-sm" name="q" defaultValue={params.q} placeholder="Receipt, invoice, or patient" /><Button type="submit" variant="outline">Search</Button></form>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left"><tr><th className="p-3">Receipt</th><th className="p-3">Invoice</th><th className="p-3">Patient</th><th className="p-3">Amount</th><th className="p-3">Method</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.id} className="border-b"><td className="p-3"><Link className="underline" href={`/payments/${row.id}`}>{row.receipt_number}</Link></td><td className="p-3">{row.invoice_number}</td><td className="p-3">{row.full_name}</td><td className="p-3">{money(row.amount ?? "0")}</td><td className="p-3">{row.method}</td></tr>)}
            {rows.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan={5}>No payments yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} path="/payments" params={{ q: params.q }} />
    </div>
  );
}
