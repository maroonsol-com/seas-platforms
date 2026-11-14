"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "./access";
import { inviteAdministrator, removeAdministratorRole, setAdministratorStatus } from "./administrators";
import { saveBusiness, setBusinessStatus } from "./businesses";
import { publicError } from "./errors";
import { recordPayment, setPaymentStatus, isPaymentMethod } from "./payments";
import { isBillingCycle, savePlan } from "./plans";
import { saveProduct, setProductStatus } from "./products";
import { provisionBusiness } from "./provisioning";
import {
  activateSubscription,
  assignSubscription,
  cancelSubscription,
  changePlan,
  extendSubscription,
  reactivateSubscription,
  renewSubscription,
  suspendSubscription,
} from "./subscriptions";
import {
  dateValue,
  emailValue,
  envVarName,
  featureList,
  gstinValue,
  integerValue,
  metadataObject,
  moneyValue,
  optionalInteger,
  optionalText,
  positiveMoney,
  requiredText,
} from "./validate";

export type ActionState = { error?: string };

function rethrowRedirect(error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }
}

export async function saveProductAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission("products.write");
    const id = await saveProduct({
      actorId: session.administratorId,
      id: optionalText(formData.get("id")) ?? undefined,
      name: requiredText(formData.get("name"), "Name"),
      slug: requiredText(formData.get("slug"), "Slug"),
      description: requiredText(formData.get("description"), "Description"),
      productUrl: optionalText(formData.get("productUrl")),
      status: formData.get("status") === "inactive" ? "inactive" : "active",
      features: featureList(formData.get("features")),
      metadata: metadataObject(formData.get("metadata")),
      provisioningUrl: optionalText(formData.get("provisioningUrl")),
      entitlementUrl: optionalText(formData.get("entitlementUrl")),
      secretEnvVar: envVarName(formData.get("secretEnvVar")),
    });
    revalidatePath("/products");
    redirect(`/products/${id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { error: publicError(error, "The product could not be saved.") };
  }
}

export async function setProductStatusAction(formData: FormData) {
  const session = await requirePermission("products.write");
  const id = requiredText(formData.get("id"), "Product");
  await setProductStatus(session.administratorId, id, formData.get("status") === "inactive" ? "inactive" : "active");
  revalidatePath(`/products/${id}`);
}

export async function savePlanAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission("plans.write");
    const cycle = requiredText(formData.get("billingCycle"), "Billing cycle");
    if (!isBillingCycle(cycle)) {
      return { error: "Choose a billing cycle." };
    }
    const currency = requiredText(formData.get("currency"), "Currency");
    if (!/^[A-Za-z]{3}$/.test(currency)) {
      return { error: "Currency must be a 3-letter code." };
    }
    const id = await savePlan({
      actorId: session.administratorId,
      id: optionalText(formData.get("id")) ?? undefined,
      productId: requiredText(formData.get("productId"), "Product"),
      name: requiredText(formData.get("name"), "Name"),
      description: String(formData.get("description") ?? ""),
      price: moneyValue(formData.get("price"), "Price"),
      currency,
      billingCycle: cycle,
      trialDays: integerValue(formData.get("trialDays"), "Trial days"),
      graceDays: integerValue(formData.get("graceDays"), "Grace period"),
      maxUsers: optionalInteger(formData.get("maxUsers"), "Maximum users"),
      maxBranches: optionalInteger(formData.get("maxBranches"), "Maximum branches"),
      storageLimitMb: optionalInteger(formData.get("storageLimitMb"), "Storage limit"),
      features: featureList(formData.get("features")),
      status: formData.get("status") === "inactive" ? "inactive" : "active",
    });
    revalidatePath("/plans");
    redirect(`/plans/${id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { error: publicError(error, "The plan could not be saved.") };
  }
}

export async function saveBusinessAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission("businesses.write");
    const id = await saveBusiness({
      actorId: session.administratorId,
      id: optionalText(formData.get("id")) ?? undefined,
      legalName: requiredText(formData.get("legalName"), "Legal name"),
      displayName: requiredText(formData.get("displayName"), "Display name"),
      businessType: requiredText(formData.get("businessType"), "Business type"),
      ownerName: requiredText(formData.get("ownerName"), "Owner name"),
      ownerEmail: emailValue(formData.get("ownerEmail"), "Owner email"),
      ownerMobile: requiredText(formData.get("ownerMobile"), "Owner mobile"),
      addressLine1: requiredText(formData.get("addressLine1"), "Address"),
      addressLine2: optionalText(formData.get("addressLine2")),
      city: requiredText(formData.get("city"), "City"),
      state: requiredText(formData.get("state"), "State"),
      postalCode: requiredText(formData.get("postalCode"), "Postal code"),
      country: optionalText(formData.get("country")) ?? "IN",
      gstin: gstinValue(formData.get("gstin")),
      timezone: optionalText(formData.get("timezone")) ?? "Asia/Kolkata",
      internalNotes: optionalText(formData.get("internalNotes")),
      productId: requiredText(formData.get("productId"), "Product"),
      planId: optionalText(formData.get("planId")),
      startsOn: optionalText(formData.get("startsOn")),
      expiresOn: optionalText(formData.get("expiresOn")),
    });
    revalidatePath("/businesses");
    redirect(`/businesses/${id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { error: publicError(error, "The business could not be saved.") };
  }
}

export async function businessStatusAction(formData: FormData) {
  const session = await requirePermission("businesses.write");
  const id = requiredText(formData.get("id"), "Business");
  await setBusinessStatus(session.administratorId, id, formData.get("status") === "suspended" ? "suspended" : "active");
  revalidatePath(`/businesses/${id}`);
}

export async function provisionAction(formData: FormData): Promise<void> {
  const session = await requirePermission("provisioning.retry");
  const id = requiredText(formData.get("id"), "Business");
  try {
    await provisionBusiness(session.administratorId, id);
  } catch (error) {
    rethrowRedirect(error);
    redirect(`/businesses/${id}?notice=${encodeURIComponent(publicError(error, "Provisioning failed."))}`);
  }
  revalidatePath(`/businesses/${id}`);
  redirect(`/businesses/${id}`);
}

export async function assignSubscriptionAction(formData: FormData) {
  const session = await requirePermission("subscriptions.write");
  const businessId = requiredText(formData.get("businessId"), "Business");
  await assignSubscription({
    actorId: session.administratorId,
    businessId,
    planId: requiredText(formData.get("planId"), "Plan"),
    startsOn: dateValue(formData.get("startsOn"), "Start date"),
    expiresOn: dateValue(formData.get("expiresOn"), "Expiry date"),
  });
  revalidatePath(`/businesses/${businessId}`);
  revalidatePath("/subscriptions");
}

export async function subscriptionAction(formData: FormData) {
  const session = await requirePermission("subscriptions.write");
  const subscriptionId = requiredText(formData.get("subscriptionId"), "Subscription");
  const operation = String(formData.get("operation") ?? "");
  if (operation === "suspend") await suspendSubscription(session.administratorId, subscriptionId);
  if (operation === "reactivate") await reactivateSubscription(session.administratorId, subscriptionId);
  if (operation === "cancel") await cancelSubscription(session.administratorId, subscriptionId);
  if (operation === "activate") await activateSubscription(session.administratorId, subscriptionId);
  if (operation === "renew") await renewSubscription(session.administratorId, subscriptionId, dateValue(formData.get("expiresOn"), "Expiry date"));
  if (operation === "extend") await extendSubscription(session.administratorId, subscriptionId, dateValue(formData.get("expiresOn"), "Expiry date"));
  if (operation === "change-plan") await changePlan(session.administratorId, subscriptionId, requiredText(formData.get("planId"), "Plan"));
  revalidatePath("/subscriptions");
  revalidatePath("/businesses");
}

export async function recordPaymentAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission("payments.write");
    const method = requiredText(formData.get("method"), "Method");
    if (!isPaymentMethod(method)) {
      return { error: "Choose a payment method." };
    }
    const businessId = requiredText(formData.get("businessId"), "Business");
    await recordPayment({
      actorId: session.administratorId,
      businessId,
      subscriptionId: optionalText(formData.get("subscriptionId")),
      amount: positiveMoney(formData.get("amount"), "Amount"),
      currency: requiredText(formData.get("currency"), "Currency"),
      paymentDate: dateValue(formData.get("paymentDate"), "Payment date"),
      method,
      transactionReference: optionalText(formData.get("transactionReference")),
      remarks: optionalText(formData.get("remarks")),
      idempotencyKey: optionalText(formData.get("idempotencyKey")) ?? crypto.randomUUID(),
    });
    revalidatePath("/payments");
    redirect(`/businesses/${businessId}`);
  } catch (error) {
    rethrowRedirect(error);
    return { error: publicError(error, "The payment could not be saved.") };
  }
}

export async function paymentStatusAction(formData: FormData) {
  const session = await requirePermission("payments.write");
  const status = String(formData.get("status") ?? "");
  if (status !== "recorded" && status !== "received" && status !== "voided") {
    return;
  }
  await setPaymentStatus(session.administratorId, requiredText(formData.get("id"), "Payment"), status);
  revalidatePath("/payments");
}

export async function inviteAdministratorAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission("administrators.write");
    await inviteAdministrator({
      actorId: session.administratorId,
      name: requiredText(formData.get("name"), "Name"),
      email: emailValue(formData.get("email"), "Email"),
      roleId: requiredText(formData.get("roleId"), "Role"),
    });
    revalidatePath("/administrators");
    return {};
  } catch (error) {
    rethrowRedirect(error);
    return { error: publicError(error, "The administrator could not be invited.") };
  }
}

export async function administratorStatusAction(formData: FormData) {
  const session = await requirePermission("administrators.write");
  await setAdministratorStatus(
    session.administratorId,
    requiredText(formData.get("id"), "Administrator"),
    formData.get("status") === "disabled" ? "disabled" : "active",
  );
  revalidatePath("/administrators");
}

export async function removeRoleAction(formData: FormData) {
  const session = await requirePermission("administrators.write");
  await removeAdministratorRole(
    session.administratorId,
    requiredText(formData.get("id"), "Administrator"),
    requiredText(formData.get("roleId"), "Role"),
  );
  revalidatePath("/administrators");
}
