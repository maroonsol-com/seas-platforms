import { connection } from "next/server";
import Link from "next/link";

import { BoundForm } from "@/components/clinic/bound-form";
import { controlClass, money } from "@/components/clinic/format";
import { Pager } from "@/components/clinic/pager";
import { Button } from "@/components/ui/button";
import { requireBusiness, requireSubscription } from "@/server/access";
import { saveServiceAction } from "@/server/actions";
import { listServices } from "@/server/catalogue";
import { pageNumber } from "@/server/constants";

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  const params = await searchParams;
  const page = pageNumber(params.page);
  const { rows, total } = await listServices(ctx, { page, query: params.q });
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Services</h1>
      <p className="text-sm text-muted-foreground">Services can be billed on invoices. They do not change inventory.</p>
      <form className="flex gap-2"><input className="h-9 flex-1 rounded-lg border px-3 text-sm" name="q" defaultValue={params.q} placeholder="Name or code" /><Button type="submit" variant="outline">Search</Button></form>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left"><tr><th className="p-3">Service</th><th className="p-3">Price</th><th className="p-3">Tax</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {rows.map((service) => <tr key={service.id} className="border-b"><td className="p-3"><Link className="underline" href={`/services/${service.id}`}>{service.name}</Link><div className="text-xs text-muted-foreground">{service.code}</div></td><td className="p-3">{money(service.defaultPrice)}</td><td className="p-3">{service.taxClassification || "Not set"}{service.taxRate ? ` · ${service.taxRate}%` : ""}</td><td className="p-3">{service.status}</td></tr>)}
            {rows.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan={4}>No services yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} path="/services" params={{ q: params.q }} />
      <BoundForm action={saveServiceAction} submitLabel="Add service">
        <input className={controlClass} name="name" placeholder="Name" required />
        <input className={controlClass} name="code" placeholder="Service code" />
        <textarea className="min-h-16 rounded-lg border px-3 py-2 text-sm" name="description" placeholder="Description" />
        <input className={controlClass} name="unit" defaultValue="unit" />
        <input className={controlClass} name="sellingPrice" placeholder="Selling price" required />
        <input className={controlClass} name="taxClassification" placeholder="Tax classification" />
        <input className={controlClass} name="taxRate" placeholder="Tax rate %" />
      </BoundForm>
    </div>
  );
}
