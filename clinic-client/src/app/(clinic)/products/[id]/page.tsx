import { connection } from "next/server";
import { notFound } from "next/navigation";

import { BoundForm } from "@/components/clinic/bound-form";
import { controlClass } from "@/components/clinic/format";
import { requireBusiness, requireSubscription } from "@/server/access";
import { productStatusAction, saveProductAction } from "@/server/actions";
import { getProduct } from "@/server/catalogue";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  const { id } = await params;
  const product = await getProduct(ctx, id);
  if (!product) notFound();
  return (
    <div className="grid max-w-xl gap-4">
      <h1 className="text-2xl font-semibold">{product.name}</h1>
      <p className="text-sm text-muted-foreground">Created {product.createdAt.toISOString().slice(0, 10)}. Changing this product does not change issued invoices or stock.</p>
      <form action={productStatusAction.bind(null, product.id, product.status === "active" ? "inactive" : "active")}>
        <button className="text-sm underline" type="submit">{product.status === "active" ? "Deactivate" : "Activate"}</button>
      </form>
      <BoundForm action={saveProductAction}>
        <input type="hidden" name="id" value={product.id} />
        <input type="hidden" name="status" value={product.status} />
        <input className={controlClass} name="name" defaultValue={product.name} required />
        <input className={controlClass} name="code" defaultValue={product.sku} required />
        <textarea className="min-h-16 rounded-lg border px-3 py-2 text-sm" name="description" defaultValue={product.description} />
        <input className={controlClass} name="unit" defaultValue={product.unit} />
        <input className={controlClass} name="sellingPrice" defaultValue={product.sellingPrice} required />
        <input className={controlClass} name="purchasePrice" defaultValue={product.purchasePrice} />
        <input className={controlClass} name="taxClassification" defaultValue={product.taxClassification ?? ""} />
        <input className={controlClass} name="taxRate" defaultValue={product.taxRate ?? ""} />
      </BoundForm>
    </div>
  );
}
