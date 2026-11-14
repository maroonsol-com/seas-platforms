import { connection } from "next/server";
import { notFound } from "next/navigation";

import { BoundForm } from "@/components/clinic/bound-form";
import { controlClass } from "@/components/clinic/format";
import { requireBusiness, requireSubscription } from "@/server/access";
import { saveServiceAction, serviceStatusAction } from "@/server/actions";
import { getService } from "@/server/catalogue";

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  const { id } = await params;
  const service = await getService(ctx, id);
  if (!service) notFound();
  return (
    <div className="grid max-w-xl gap-4">
      <h1 className="text-2xl font-semibold">{service.name}</h1>
      <form action={serviceStatusAction.bind(null, service.id, service.status === "active" ? "inactive" : "active")}>
        <button className="text-sm underline" type="submit">{service.status === "active" ? "Deactivate" : "Activate"}</button>
      </form>
      <BoundForm action={saveServiceAction}>
        <input type="hidden" name="id" value={service.id} />
        <input type="hidden" name="status" value={service.status} />
        <input className={controlClass} name="name" defaultValue={service.name} required />
        <input className={controlClass} name="code" defaultValue={service.code ?? ""} />
        <textarea className="min-h-16 rounded-lg border px-3 py-2 text-sm" name="description" defaultValue={service.description} />
        <input className={controlClass} name="unit" defaultValue={service.unit} />
        <input className={controlClass} name="sellingPrice" defaultValue={service.defaultPrice} required />
        <input className={controlClass} name="taxClassification" defaultValue={service.taxClassification ?? ""} />
        <input className={controlClass} name="taxRate" defaultValue={service.taxRate ?? ""} />
      </BoundForm>
    </div>
  );
}
