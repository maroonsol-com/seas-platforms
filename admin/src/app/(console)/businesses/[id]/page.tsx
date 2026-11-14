import { connection } from "next/server";

import Link from "next/link";
import { notFound } from "next/navigation";

import { PageSuspense } from "@/components/admin/page-suspense";
import { BusinessFields } from "../new/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/admin/action-form";
import {
  assignSubscriptionAction,
  businessStatusAction,
  provisionAction,
  subscriptionAction,
} from "@/server/actions";
import { getBusiness } from "@/server/businesses";
import { PROVISIONING_LABELS } from "@/server/constants";
import { listPayments } from "@/server/payments";
import { listActivePlansForProduct } from "@/server/plans";
import { listProducts } from "@/server/products";
import { listSubscriptionHistory, subscriptionsForBusiness } from "@/server/subscriptions";

export const instant = false;

export default function BusinessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <PageSuspense>
      <BusinessContent params={params} searchParams={searchParams} />
    </PageSuspense>
  );
}

async function BusinessContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await connection();
  const { id } = await params;
  const query = await searchParams;
  const record = await getBusiness(id);
  if (!record || !record.link) {
    notFound();
  }
  const products = await listProducts({ page: 1 });
  const plans = await listActivePlansForProduct(record.link.productId);
  const subscriptions = await subscriptionsForBusiness(id);
  const history = await listSubscriptionHistory(id);
  const payments = await listPayments(1, id);
  const open = subscriptions.find((item) => ["trial", "active", "expiring_soon", "suspended"].includes(item.status));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{record.business.displayName}</h1>
          <p className="text-sm text-muted-foreground">{record.business.legalName} · {record.link.productName}</p>
        </div>
        <Badge>{record.business.status}</Badge>
      </div>
      {query.notice ? <p role="alert" className="text-sm">{query.notice}</p> : null}
      <div className="flex flex-wrap gap-2">
        {record.business.status !== "suspended" ? (
          <form action={businessStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="suspended" /><Button variant="outline" type="submit">Suspend</Button></form>
        ) : (
          <form action={businessStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="active" /><Button type="submit">Reactivate</Button></form>
        )}
        {record.provisioning && record.provisioning.status !== "succeeded" ? (
          <form action={provisionAction}><input type="hidden" name="id" value={id} /><Button type="submit">Provision clinic</Button></form>
        ) : null}
        <Button variant="outline" render={<Link href={`/payments/new?businessId=${id}`} />}>Record payment</Button>
      </div>
      {record.provisioning ? (
        <p className="text-sm">Provisioning: {PROVISIONING_LABELS[record.provisioning.status]}{record.provisioning.lastError ? ` — ${record.provisioning.lastError}` : ""}</p>
      ) : null}

      <section className="grid gap-3">
        <h2 className="font-semibold">Subscriptions</h2>
        {subscriptions.length === 0 ? <p className="text-sm text-muted-foreground">No subscription yet.</p> : (
          <ul className="grid gap-2 text-sm">
            {subscriptions.map((subscription) => (
              <li key={subscription.id} className="rounded-lg border bg-background p-3">
                {subscription.planName} · {subscription.status} · {subscription.startsOn} to {subscription.expiresOn}
                {open?.id === subscription.id ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={subscriptionAction}><input type="hidden" name="subscriptionId" value={subscription.id} /><input type="hidden" name="operation" value="suspend" /><Button variant="outline" size="sm" type="submit">Suspend</Button></form>
                    <form action={subscriptionAction}><input type="hidden" name="subscriptionId" value={subscription.id} /><input type="hidden" name="operation" value="reactivate" /><Button variant="outline" size="sm" type="submit">Reactivate</Button></form>
                    <form action={subscriptionAction}><input type="hidden" name="subscriptionId" value={subscription.id} /><input type="hidden" name="operation" value="activate" /><Button variant="outline" size="sm" type="submit">Activate</Button></form>
                    <form action={subscriptionAction}><input type="hidden" name="subscriptionId" value={subscription.id} /><input type="hidden" name="operation" value="cancel" /><Button variant="outline" size="sm" type="submit">Cancel</Button></form>
                    <form action={subscriptionAction} className="flex gap-2"><input type="hidden" name="subscriptionId" value={subscription.id} /><input type="hidden" name="operation" value="renew" /><input className={controlClass} type="date" name="expiresOn" required /><Button size="sm" type="submit">Renew</Button></form>
                    <form action={subscriptionAction} className="flex gap-2"><input type="hidden" name="subscriptionId" value={subscription.id} /><input type="hidden" name="operation" value="extend" /><input className={controlClass} type="date" name="expiresOn" required /><Button size="sm" variant="outline" type="submit">Extend</Button></form>
                    <form action={subscriptionAction} className="flex gap-2">
                      <input type="hidden" name="subscriptionId" value={subscription.id} />
                      <input type="hidden" name="operation" value="change-plan" />
                      <select className={controlClass} name="planId">{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
                      <Button size="sm" variant="outline" type="submit">Change plan</Button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {!open && plans.length > 0 ? (
          <form action={assignSubscriptionAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="businessId" value={id} />
            <select className={controlClass} name="planId">{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
            <input className={controlClass} type="date" name="startsOn" required />
            <input className={controlClass} type="date" name="expiresOn" required />
            <Button type="submit">Assign subscription</Button>
          </form>
        ) : null}
        {history.length > 0 ? <p className="text-xs text-muted-foreground">{history.length} subscription history records. History cannot be edited.</p> : null}
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">Payments</h2>
        {payments.rows.length === 0 ? <p className="text-sm text-muted-foreground">No payments recorded. Recording a payment does not renew the subscription.</p> : (
          <ul className="text-sm">
            {payments.rows.map((payment) => (
              <li key={payment.id}>{payment.paymentDate} · {payment.currency} {payment.amount} · {payment.method} · {payment.status}</li>
            ))}
          </ul>
        )}
      </section>

      <BusinessFields
        products={products.rows}
        plans={plans}
        values={{
          id,
          legalName: record.business.legalName,
          displayName: record.business.displayName,
          businessType: record.business.businessType,
          ownerName: record.business.ownerName,
          ownerEmail: record.business.ownerEmail,
          ownerMobile: record.business.ownerMobile,
          addressLine1: record.business.addressLine1,
          addressLine2: record.business.addressLine2,
          city: record.business.city,
          state: record.business.state,
          postalCode: record.business.postalCode,
          country: record.business.country,
          gstin: record.business.gstin,
          timezone: record.business.timezone,
          internalNotes: record.business.internalNotes,
          productId: record.link.productId,
        }}
      />
    </div>
  );
}
