import { connection } from "next/server";

import { notFound } from "next/navigation";

import { PageSuspense } from "@/components/admin/page-suspense";
import { PlanFields } from "../new/page";
import { getPlan } from "@/server/plans";
import { listProducts } from "@/server/products";

export const instant = false;

export default function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageSuspense>
      <PlanContent params={params} />
    </PageSuspense>
  );
}

async function PlanContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const record = await getPlan(id);
  if (!record) {
    notFound();
  }
  const products = await listProducts({ page: 1 });
  return (
    <div className="grid max-w-2xl gap-4">
      <h1 className="text-2xl font-semibold">{record.plan.name}</h1>
      <PlanFields
        products={products.rows}
        values={{
          id,
          productId: record.plan.productId,
          name: record.plan.name,
          description: record.plan.description,
          price: record.plan.price,
          currency: record.plan.currency,
          billingCycle: record.plan.billingCycle,
          trialDays: record.plan.trialDays,
          graceDays: record.plan.graceDays,
          maxUsers: record.plan.maxUsers,
          maxBranches: record.plan.maxBranches,
          storageLimitMb: record.plan.storageLimitMb,
          features: record.features.map((feature) => feature.featureKey),
          status: record.plan.status,
        }}
      />
    </div>
  );
}
