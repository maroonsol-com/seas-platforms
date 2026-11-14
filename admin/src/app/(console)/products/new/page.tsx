import { connection } from "next/server";

import { ActionForm, controlClass, Field } from "@/components/admin/action-form";
import { PageSuspense } from "@/components/admin/page-suspense";
import { saveProductAction } from "@/server/actions";

export const instant = false;

export default function NewProductPage() {
  return (
    <PageSuspense>
      <NewProductContent />
    </PageSuspense>
  );
}

async function NewProductContent() {
  await connection();
  return (
    <div className="grid max-w-2xl gap-4">
      <h1 className="text-2xl font-semibold">New product</h1>
      <ProductFields action={saveProductAction} submitLabel="Create product" />
    </div>
  );
}

export function ProductFields({
  action,
  submitLabel,
  values,
}: {
  action: typeof saveProductAction;
  submitLabel: string;
  values?: {
    id: string;
    name: string;
    slug: string;
    description: string;
    productUrl: string | null;
    status: string;
    features: string[];
    metadata: Record<string, unknown>;
    provisioningUrl: string | null;
    entitlementUrl: string | null;
    secretEnvVar: string | null;
  };
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel}>
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <Field label="Name"><input className={controlClass} name="name" defaultValue={values?.name} required /></Field>
      <Field label="Slug"><input className={controlClass} name="slug" defaultValue={values?.slug} required /></Field>
      <Field label="Description"><textarea className={`${controlClass} h-24 py-2`} name="description" defaultValue={values?.description} required /></Field>
      <Field label="Application URL"><input className={controlClass} name="productUrl" defaultValue={values?.productUrl ?? ""} placeholder="https://clinic.example.com" /></Field>
      <Field label="Status">
        <select className={controlClass} name="status" defaultValue={values?.status ?? "inactive"}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </Field>
      <Field label="Feature metadata"><textarea className={`${controlClass} h-20 py-2`} name="features" defaultValue={values?.features.join("\n")} placeholder="One feature key per line" /></Field>
      <Field label="Metadata JSON"><textarea className={`${controlClass} h-20 py-2`} name="metadata" defaultValue={JSON.stringify(values?.metadata ?? {}, null, 2)} /></Field>
      <Field label="Provisioning URL"><input className={controlClass} name="provisioningUrl" defaultValue={values?.provisioningUrl ?? ""} /></Field>
      <Field label="Entitlement URL"><input className={controlClass} name="entitlementUrl" defaultValue={values?.entitlementUrl ?? ""} /></Field>
      <Field label="Secret environment variable name"><input className={controlClass} name="secretEnvVar" defaultValue={values?.secretEnvVar ?? ""} placeholder="CLINIC_PROVISIONING_SECRET" /></Field>
    </ActionForm>
  );
}
