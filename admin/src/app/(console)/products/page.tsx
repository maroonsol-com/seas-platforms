import { connection } from "next/server";

import Link from "next/link";

import { PageSuspense } from "@/components/admin/page-suspense";
import { Pager } from "@/components/admin/pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listProducts } from "@/server/products";
import { pageNumber } from "@/server/validate";

export const instant = false;

export default function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  return (
    <PageSuspense>
      <ProductsContent searchParams={searchParams} />
    </PageSuspense>
  );
}

async function ProductsContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const { rows, total } = await listProducts({ page, query: params.q });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Button render={<Link href="/products/new" />}>New product</Button>
      </div>
      <form className="flex gap-2">
        <input name="q" defaultValue={params.q} placeholder="Search products" className="h-9 w-full max-w-sm rounded-lg border px-3 text-sm" />
        <Button variant="outline" type="submit">Search</Button>
      </form>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left"><tr><th className="p-3">Name</th><th className="p-3">Slug</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {rows.map((product) => (
              <tr key={product.id} className="border-b last:border-0">
                <td className="p-3"><Link className="underline" href={`/products/${product.id}`}>{product.name}</Link></td>
                <td className="p-3">{product.slug}</td>
                <td className="p-3"><Badge variant={product.status === "active" ? "default" : "secondary"}>{product.status}</Badge></td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan={3}>No products yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} path="/products" query={params.q} />
    </div>
  );
}
