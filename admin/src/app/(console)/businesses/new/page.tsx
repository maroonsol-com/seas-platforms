import { connection } from "next/server";

import { ActionForm, controlClass, Field } from "@/components/admin/action-form";
import { PageSuspense } from "@/components/admin/page-suspense";
import { saveBusinessAction } from "@/server/actions";
import { listActivePlansForProduct } from "@/server/plans";
import { listProducts } from "@/server/products";

export const instant = false;

export default function NewBusinessPage() {
  return (
    <PageSuspense>
      <NewBusinessContent />
    </PageSuspense>
  );
}

async function NewBusinessContent() {
  await connection();
  const products = await listProducts({ page: 1 });
  const plans = products.rows[0] ? await listActivePlansForProduct(products.rows[0].id) : [];
  return (
    <div className="grid max-w-2xl gap-4">
      <h1 className="text-2xl font-semibold">New business</h1>
      {plans.length === 0 ? <p className="text-sm text-muted-foreground">No subscription price has been configured. You can create the business now and assign a plan after an administrator enters pricing.</p> : null}
      <BusinessFields products={products.rows} plans={plans} />
    </div>
  );
}

export function BusinessFields({
  products,
  plans,
  values,
}: {
  products: Array<{ id: string; name: string }>;
  plans: Array<{ id: string; name: string; currency: string; price: string; billingCycle: string }>;
  values?: {
    id: string;
    legalName: string;
    displayName: string;
    businessType: string;
    ownerName: string;
    ownerEmail: string;
    ownerMobile: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    gstin: string | null;
    timezone: string;
    internalNotes: string | null;
    productId: string;
  };
}) {
  return (
    <ActionForm action={saveBusinessAction} submitLabel={values ? "Save business" : "Create business"}>
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <Field label="Legal name"><input className={controlClass} name="legalName" defaultValue={values?.legalName} required /></Field>
      <Field label="Display name"><input className={controlClass} name="displayName" defaultValue={values?.displayName} required /></Field>
      <Field label="Business type"><input className={controlClass} name="businessType" defaultValue={values?.businessType} required /></Field>
      <Field label="Owner name"><input className={controlClass} name="ownerName" defaultValue={values?.ownerName} required /></Field>
      <Field label="Owner email"><input className={controlClass} name="ownerEmail" type="email" defaultValue={values?.ownerEmail} required /></Field>
      <Field label="Owner mobile"><input className={controlClass} name="ownerMobile" defaultValue={values?.ownerMobile} required /></Field>
      <Field label="Address"><input className={controlClass} name="addressLine1" defaultValue={values?.addressLine1} required /></Field>
      <Field label="Address line 2"><input className={controlClass} name="addressLine2" defaultValue={values?.addressLine2 ?? ""} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City"><input className={controlClass} name="city" defaultValue={values?.city} required /></Field>
        <Field label="State"><input className={controlClass} name="state" defaultValue={values?.state} required /></Field>
        <Field label="Postal code"><input className={controlClass} name="postalCode" defaultValue={values?.postalCode} required /></Field>
        <Field label="Country"><input className={controlClass} name="country" defaultValue={values?.country ?? "IN"} /></Field>
      </div>
      <Field label="GSTIN (optional)"><input className={controlClass} name="gstin" defaultValue={values?.gstin ?? ""} /></Field>
      <Field label="Timezone"><input className={controlClass} name="timezone" defaultValue={values?.timezone ?? "Asia/Kolkata"} /></Field>
      <Field label="Product">
        <select className={controlClass} name="productId" defaultValue={values?.productId ?? products[0]?.id} required>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
      </Field>
      <Field label="Plan">
        <select className={controlClass} name="planId" defaultValue="">
          <option value="">Assign later</option>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.currency} {plan.price} · {plan.billingCycle}</option>)}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date"><input className={controlClass} type="date" name="startsOn" /></Field>
        <Field label="Expiry date"><input className={controlClass} type="date" name="expiresOn" /></Field>
      </div>
      <Field label="Internal notes"><textarea className={`${controlClass} h-20 py-2`} name="internalNotes" defaultValue={values?.internalNotes ?? ""} /></Field>
    </ActionForm>
  );
}
