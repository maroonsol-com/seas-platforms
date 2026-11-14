import { connection } from "next/server";

import { ActionForm, controlClass, Field } from "@/components/admin/action-form";
import { PageSuspense } from "@/components/admin/page-suspense";
import { savePlanAction } from "@/server/actions";
import { listProducts } from "@/server/products";

export const instant = false;

export default function NewPlanPage() {
  return (
    <PageSuspense>
      <NewPlanContent />
    </PageSuspense>
  );
}

async function NewPlanContent() {
  await connection();
  const products = await listProducts({ page: 1 });
  return (
    <div className="grid max-w-2xl gap-4">
      <h1 className="text-2xl font-semibold">New plan</h1>
      <PlanFields products={products.rows} />
    </div>
  );
}

export function PlanFields({
  products,
  values,
}: {
  products: Array<{ id: string; name: string }>;
  values?: {
    id: string;
    productId: string;
    name: string;
    description: string;
    price: string;
    currency: string;
    billingCycle: string;
    trialDays: number;
    graceDays: number;
    maxUsers: number | null;
    maxBranches: number | null;
    storageLimitMb: number | null;
    features: string[];
    status: string;
  };
}) {
  return (
    <ActionForm action={savePlanAction} submitLabel={values ? "Save plan" : "Create plan"}>
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <Field label="Product">
        <select className={controlClass} name="productId" defaultValue={values?.productId ?? products[0]?.id}>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
      </Field>
      <Field label="Name"><input className={controlClass} name="name" defaultValue={values?.name} required /></Field>
      <Field label="Description"><textarea className={`${controlClass} h-20 py-2`} name="description" defaultValue={values?.description} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Price"><input className={controlClass} name="price" defaultValue={values?.price} required /></Field>
        <Field label="Currency"><input className={controlClass} name="currency" defaultValue={values?.currency ?? "INR"} maxLength={3} required /></Field>
        <Field label="Billing cycle">
          <select className={controlClass} name="billingCycle" defaultValue={values?.billingCycle ?? "monthly"}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half_yearly">Half-yearly</option>
            <option value="yearly">Annual</option>
            <option value="custom">Custom</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Trial days"><input className={controlClass} name="trialDays" type="number" min={0} defaultValue={values?.trialDays ?? 0} /></Field>
        <Field label="Grace period days"><input className={controlClass} name="graceDays" type="number" min={0} defaultValue={values?.graceDays ?? 0} /></Field>
        <Field label="Maximum users"><input className={controlClass} name="maxUsers" type="number" min={0} defaultValue={values?.maxUsers ?? ""} /></Field>
        <Field label="Maximum branches"><input className={controlClass} name="maxBranches" type="number" min={0} defaultValue={values?.maxBranches ?? ""} /></Field>
        <Field label="Storage limit (MB)"><input className={controlClass} name="storageLimitMb" type="number" min={0} defaultValue={values?.storageLimitMb ?? ""} /></Field>
      </div>
      <Field label="Feature entitlements"><textarea className={`${controlClass} h-20 py-2`} name="features" defaultValue={values?.features.join("\n")} placeholder="One feature key per line" /></Field>
      <Field label="Status">
        <select className={controlClass} name="status" defaultValue={values?.status ?? "active"}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </Field>
    </ActionForm>
  );
}
