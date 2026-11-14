import { connection } from "next/server";

import Link from "next/link";

import { PageSuspense } from "@/components/admin/page-suspense";
import { Pager } from "@/components/admin/pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROVISIONING_LABELS } from "@/server/constants";
import { listBusinesses } from "@/server/businesses";
import { listProducts } from "@/server/products";
import { pageNumber } from "@/server/validate";

export const instant = false;

export default function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; productId?: string; status?: string }>;
}) {
  return (
    <PageSuspense>
      <BusinessesContent searchParams={searchParams} />
    </PageSuspense>
  );
}

async function BusinessesContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; productId?: string; status?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const { rows, total } = await listBusinesses({
    page,
    query: params.q,
    productId: params.productId,
    status: params.status,
  });
  const products = await listProducts({ page: 1 });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Businesses</h1>
        <Button render={<Link href="/businesses/new" />}>New business</Button>
      </div>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={params.q} placeholder="Search name or owner email" className="h-9 min-w-48 flex-1 rounded-lg border px-3 text-sm" />
        <select name="productId" defaultValue={params.productId ?? ""} className="h-9 rounded-lg border px-2 text-sm">
          <option value="">All products</option>
          {products.rows.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <select name="status" defaultValue={params.status ?? ""} className="h-9 rounded-lg border px-2 text-sm">
          <option value="">All statuses</option>
          <option value="provisioning_pending">Provisioning pending</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </select>
        <Button variant="outline" type="submit">Filter</Button>
      </form>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left"><tr><th className="p-3">Business</th><th className="p-3">Product</th><th className="p-3">Status</th><th className="p-3">Provisioning</th></tr></thead>
          <tbody>
            {rows.map((business) => (
              <tr key={business.id} className="border-b last:border-0">
                <td className="p-3"><Link className="underline" href={`/businesses/${business.id}`}>{business.displayName}</Link><div className="text-xs text-muted-foreground">{business.ownerEmail}</div></td>
                <td className="p-3">{business.productName}</td>
                <td className="p-3"><Badge variant="secondary">{business.status}</Badge></td>
                <td className="p-3">{business.provisioningStatus ? PROVISIONING_LABELS[business.provisioningStatus] : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan={4}>No businesses yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} path="/businesses" query={params.q} params={{ productId: params.productId, status: params.status }} />
    </div>
  );
}
