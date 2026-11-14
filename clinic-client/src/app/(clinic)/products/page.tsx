import { connection } from "next/server";
import Link from "next/link";

import { BoundForm } from "@/components/clinic/bound-form";
import { controlClass, money } from "@/components/clinic/format";
import { Pager } from "@/components/clinic/pager";
import { Button } from "@/components/ui/button";
import { requireBusiness, requireSubscription } from "@/server/access";
import { saveProductAction } from "@/server/actions";
import { listProducts } from "@/server/catalogue";
import { pageNumber } from "@/server/constants";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  const params = await searchParams;
  const page = pageNumber(params.page);
  const { rows, total } = await listProducts(ctx, { page, query: params.q });
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Products</h1>
      <form className="flex gap-2"><input className="h-9 flex-1 rounded-lg border px-3 text-sm" name="q" defaultValue={params.q} placeholder="Name or SKU" /><Button type="submit" variant="outline">Search</Button></form>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left"><tr><th className="p-3">Product</th><th className="p-3">Price</th><th className="p-3">Tax</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {rows.map((product) => <tr key={product.id} className="border-b"><td className="p-3"><Link className="underline" href={`/products/${product.id}`}>{product.name}</Link><div className="text-xs text-muted-foreground">{product.sku}</div></td><td className="p-3">{money(product.sellingPrice)}</td><td className="p-3">{product.taxClassification || "Not set"}{product.taxRate ? ` · ${product.taxRate}%` : ""}</td><td className="p-3">{product.status}</td></tr>)}
            {rows.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan={4}>No products yet. Adding a product does not change stock.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} path="/products" params={{ q: params.q }} />
      <BoundForm action={saveProductAction} submitLabel="Add product">
        <h2 className="font-semibold">New product</h2>
        <input className={controlClass} name="name" placeholder="Name" required />
        <input className={controlClass} name="code" placeholder="SKU" required />
        <textarea className="min-h-16 rounded-lg border px-3 py-2 text-sm" name="description" placeholder="Description" />
        <input className={controlClass} name="unit" placeholder="Unit" defaultValue="unit" />
        <input className={controlClass} name="sellingPrice" placeholder="Selling price" required />
        <input className={controlClass} name="purchasePrice" placeholder="Purchase price" />
        <input className={controlClass} name="taxClassification" placeholder="Tax classification" />
        <input className={controlClass} name="taxRate" placeholder="Tax rate %" />
      </BoundForm>
    </div>
  );
}
