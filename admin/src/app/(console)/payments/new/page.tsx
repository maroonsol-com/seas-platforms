import { connection } from "next/server";

import { ActionForm, controlClass, Field } from "@/components/admin/action-form";
import { PageSuspense } from "@/components/admin/page-suspense";
import { recordPaymentAction } from "@/server/actions";
import { listBusinessOptions } from "@/server/businesses";
import { subscriptionsForBusiness } from "@/server/subscriptions";

export const instant = false;

export default function NewPaymentPage({ searchParams }: { searchParams: Promise<{ businessId?: string }> }) {
  return (
    <PageSuspense>
      <NewPaymentContent searchParams={searchParams} />
    </PageSuspense>
  );
}

async function NewPaymentContent({ searchParams }: { searchParams: Promise<{ businessId?: string }> }) {
  await connection();
  const params = await searchParams;
  const businesses = await listBusinessOptions();
  const businessId = params.businessId ?? businesses[0]?.id;
  const subscriptions = businessId ? await subscriptionsForBusiness(businessId) : [];

  return (
    <div className="grid max-w-xl gap-4">
      <h1 className="text-2xl font-semibold">Record payment</h1>
      <p className="text-sm text-muted-foreground">This records the payment only. Renew the subscription separately.</p>
      <ActionForm action={recordPaymentAction} submitLabel="Record payment">
        <Field label="Business">
          <select className={controlClass} name="businessId" defaultValue={businessId}>
            {businesses.map((business) => <option key={business.id} value={business.id}>{business.displayName}</option>)}
          </select>
        </Field>
        <Field label="Subscription">
          <select className={controlClass} name="subscriptionId" defaultValue="">
            <option value="">None</option>
            {subscriptions.map((subscription) => <option key={subscription.id} value={subscription.id}>{subscription.planName} · {subscription.status}</option>)}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount"><input className={controlClass} name="amount" required /></Field>
          <Field label="Currency"><input className={controlClass} name="currency" defaultValue="INR" maxLength={3} required /></Field>
        </div>
        <Field label="Date"><input className={controlClass} type="date" name="paymentDate" required /></Field>
        <Field label="Method">
          <select className={controlClass} name="method" defaultValue="bank_transfer">
            <option value="bank_transfer">Bank transfer</option>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Transaction reference"><input className={controlClass} name="transactionReference" /></Field>
        <Field label="Remarks"><textarea className={`${controlClass} h-20 py-2`} name="remarks" /></Field>
      </ActionForm>
    </div>
  );
}
