import { connection } from "next/server";

import Link from "next/link";
import { notFound } from "next/navigation";

import { PageSuspense } from "@/components/admin/page-suspense";
import { ProductFields } from "../new/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { saveProductAction, setProductStatusAction } from "@/server/actions";
import { businessesForProduct, countBusinessesByProduct } from "@/server/businesses";
import { getProduct } from "@/server/products";

export const instant = false;

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageSuspense>
      <ProductContent params={params} />
    </PageSuspense>
  );
}

async function ProductContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const record = await getProduct(id);
  if (!record) {
    notFound();
  }
  const associated = await businessesForProduct(id);
  const total = await countBusinessesByProduct(id);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{record.product.name}</h1>
          <p className="text-sm text-muted-foreground">{record.product.slug}</p>
        </div>
        <Badge>{record.product.status}</Badge>
      </div>
      <form action={setProductStatusAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value={record.product.status === "active" ? "inactive" : "active"} />
        <Button variant="outline" type="submit">{record.product.status === "active" ? "Deactivate" : "Activate"}</Button>
      </form>
      <ProductFields
        action={saveProductAction}
        submitLabel="Save product"
        values={{
          id,
          name: record.product.name,
          slug: record.product.slug,
          description: record.product.description,
          productUrl: record.product.productUrl,
          status: record.product.status,
          features: record.configuration?.availableFeatures ?? [],
          metadata: record.configuration?.metadata ?? {},
          provisioningUrl: record.integration?.provisioningUrl ?? null,
          entitlementUrl: record.integration?.entitlementUrl ?? null,
          secretEnvVar: record.integration?.secretEnvVar ?? null,
        }}
      />
      <section className="grid gap-2">
        <h2 className="font-semibold">Associated businesses ({total})</h2>
        {associated.length === 0 ? <p className="text-sm text-muted-foreground">No businesses use this product yet.</p> : (
          <ul className="text-sm">
            {associated.map((business) => (
              <li key={business.id}><Link className="underline" href={`/businesses/${business.id}`}>{business.displayName}</Link> · {business.status}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
