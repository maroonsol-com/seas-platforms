"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { saveService, saveProduct, searchCatalogue, setProductStatus, setServiceStatus } from "./catalogue";
import { requireBusiness, requireSubscription } from "./access";
import { cancelInvoice, finalizeInvoice, saveDraft, type DraftLine } from "./invoices";
import { issueCreditNote, recordPayment, refundPayment } from "./payments";
import { createPatient, searchPatients, updatePatient, type PatientInput } from "./patients";
import { publicError } from "./errors";
import { catalogueSchema, patientSchema, schemaError } from "./schemas";
import { saveSettings, type SettingsInput } from "./settings";

function redirectError(error: unknown): never {
  if (typeof error === "object" && error && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) {
    throw error;
  }
  throw error;
}

function linesFrom(form: FormData): DraftLine[] {
  const kinds = form.getAll("lineKind").map(String);
  const ids = form.getAll("catalogueId").map(String);
  const quantities = form.getAll("quantity").map(String);
  const discounts = form.getAll("discount").map(String);
  const descriptions = form.getAll("lineDescription").map(String);
  return kinds.map((kind, index) => ({
    kind: kind === "service" ? "service" : "product",
    catalogueId: ids[index] ?? "",
    quantity: quantities[index] ?? "1",
    discount: discounts[index] ?? "0",
    description: descriptions[index] ?? "",
  }));
}

function patientFrom(form: FormData): PatientInput {
  return {
    fullName: String(form.get("fullName") ?? ""),
    mobile: String(form.get("mobile") ?? ""),
    email: String(form.get("email") ?? ""),
    dateOfBirth: String(form.get("dateOfBirth") ?? ""),
    gender: (String(form.get("gender") ?? "unknown") || "unknown") as PatientInput["gender"],
    address: String(form.get("address") ?? ""),
    bloodGroup: (String(form.get("bloodGroup") ?? "unknown") || "unknown") as PatientInput["bloodGroup"],
    emergencyContactName: String(form.get("emergencyContactName") ?? ""),
    emergencyContactPhone: String(form.get("emergencyContactPhone") ?? ""),
    allergies: String(form.get("allergies") ?? ""),
    history: String(form.get("history") ?? ""),
    notes: String(form.get("notes") ?? ""),
    confirmDuplicate: form.get("confirmDuplicate") === "yes",
    isActive: form.get("isActive") !== "no",
  };
}

export async function createPatientAction(_state: { error?: string; duplicate?: boolean }, form: FormData) {
  try {
    const ctx = await requireBusiness();
    requireSubscription(ctx);
    const parsed = patientSchema.safeParse(patientFrom(form));
    if (!parsed.success) return { error: schemaError(parsed.error) };
    const result = await createPatient(ctx, parsed.data);
    if ("duplicate" in result) return { duplicate: true, error: "A patient with this mobile number already exists. Submit again to keep both records." };
    redirect(`/patients/${result.patient.id}`);
  } catch (error) {
    redirectError(error);
    return { error: publicError(error, "The patient could not be saved.") };
  }
}

export async function updatePatientAction(patientId: string, _state: { error?: string }, form: FormData) {
  try {
    const ctx = await requireBusiness();
    requireSubscription(ctx);
    const parsed = patientSchema.safeParse(patientFrom(form));
    if (!parsed.success) return { error: schemaError(parsed.error) };
    await updatePatient(ctx, patientId, parsed.data);
    redirect(`/patients/${patientId}`);
  } catch (error) {
    redirectError(error);
    return { error: publicError(error, "The patient could not be saved.") };
  }
}

export async function saveProductAction(_state: { error?: string }, form: FormData) {
  try {
    const ctx = await requireBusiness();
    requireSubscription(ctx);
    const id = String(form.get("id") ?? "") || null;
    const saved = await saveProduct(ctx, id, {
      name: String(form.get("name") ?? ""),
      code: String(form.get("code") ?? ""),
      description: String(form.get("description") ?? ""),
      unit: String(form.get("unit") ?? ""),
      sellingPrice: String(form.get("sellingPrice") ?? ""),
      purchasePrice: String(form.get("purchasePrice") ?? ""),
      taxClassification: String(form.get("taxClassification") ?? ""),
      taxRate: String(form.get("taxRate") ?? ""),
      status: form.get("status") === "inactive" ? "inactive" : "active",
    });
    redirect(`/products/${saved.product.id}`);
  } catch (error) {
    redirectError(error);
    return { error: publicError(error, "The product could not be saved.") };
  }
}

export async function productStatusAction(productId: string, status: "active" | "inactive") {
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  await setProductStatus(ctx, productId, status);
  redirect(`/products/${productId}`);
}

export async function saveServiceAction(_state: { error?: string }, form: FormData) {
  try {
    const ctx = await requireBusiness();
    requireSubscription(ctx);
    const id = String(form.get("id") ?? "") || null;
    const saved = await saveService(ctx, id, {
      name: String(form.get("name") ?? ""),
      code: String(form.get("code") ?? ""),
      description: String(form.get("description") ?? ""),
      unit: String(form.get("unit") ?? ""),
      sellingPrice: String(form.get("sellingPrice") ?? ""),
      taxClassification: String(form.get("taxClassification") ?? ""),
      taxRate: String(form.get("taxRate") ?? ""),
      status: form.get("status") === "inactive" ? "inactive" : "active",
    });
    redirect(`/services/${saved.id}`);
  } catch (error) {
    redirectError(error);
    return { error: publicError(error, "The service could not be saved.") };
  }
}

export async function serviceStatusAction(serviceId: string, status: "active" | "inactive") {
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  await setServiceStatus(ctx, serviceId, status);
  redirect(`/services/${serviceId}`);
}

export async function saveInvoiceAction(_state: { error?: string }, form: FormData): Promise<{ error?: string }> {
  try {
    const ctx = await requireBusiness();
    requireSubscription(ctx);
    const id = String(form.get("invoiceId") ?? "") || null;
    const invoice = await saveDraft(ctx, id, {
      patientId: String(form.get("patientId") ?? ""),
      branchId: String(form.get("branchId") ?? ""),
      invoiceDate: String(form.get("invoiceDate") ?? ""),
      dueDate: String(form.get("dueDate") ?? ""),
      notes: String(form.get("notes") ?? ""),
      lines: linesFrom(form),
    });
    if (form.get("intent") === "finalize" && invoice?.id) {
      await finalizeInvoice(ctx, invoice.id);
      redirect(`/invoices/${invoice.id}`);
    }
    redirect(`/invoices/${invoice?.id}`);
  } catch (error) {
    redirectError(error);
    return { error: publicError(error, "The invoice could not be saved.") };
  }
}

export async function cancelInvoiceAction(invoiceId: string, _state: { error?: string }, form: FormData) {
  try {
    const ctx = await requireBusiness();
    requireSubscription(ctx);
    await cancelInvoice(ctx, invoiceId, String(form.get("reason") ?? ""));
    redirect(`/invoices/${invoiceId}`);
  } catch (error) {
    redirectError(error);
    return { error: publicError(error, "The invoice could not be cancelled.") };
  }
}

export async function recordPaymentAction(invoiceId: string, _state: { error?: string }, form: FormData) {
  try {
    const ctx = await requireBusiness();
    requireSubscription(ctx);
    const result = await recordPayment(ctx, {
      invoiceId,
      amount: String(form.get("amount") ?? ""),
      date: String(form.get("date") ?? ""),
      method: String(form.get("method") ?? ""),
      reference: String(form.get("reference") ?? ""),
      notes: String(form.get("notes") ?? ""),
      idempotencyKey: String(form.get("idempotencyKey") ?? "") || randomUUID(),
    });
    redirect(`/payments/${result.id}`);
  } catch (error) {
    redirectError(error);
    return { error: publicError(error, "The payment could not be recorded.") };
  }
}

export async function refundPaymentAction(paymentId: string, _state: { error?: string }, form: FormData) {
  try {
    const ctx = await requireBusiness();
    requireSubscription(ctx);
    await refundPayment(ctx, paymentId, String(form.get("amount") ?? ""), String(form.get("reason") ?? ""));
    redirect(`/payments/${paymentId}`);
  } catch (error) {
    redirectError(error);
    return { error: publicError(error, "The refund could not be recorded.") };
  }
}

export async function creditNoteAction(invoiceId: string, _state: { error?: string }, form: FormData) {
  try {
    const ctx = await requireBusiness();
    requireSubscription(ctx);
    await issueCreditNote(ctx, invoiceId, String(form.get("amount") ?? ""), String(form.get("reason") ?? ""));
    redirect(`/invoices/${invoiceId}`);
  } catch (error) {
    redirectError(error);
    return { error: publicError(error, "The credit note could not be issued.") };
  }
}

export async function searchPatientsAction(query: string) {
  const ctx = await requireBusiness();
  return searchPatients(ctx, query);
}

export async function createPatientInlineAction(input: PatientInput) {
  const parsed = patientSchema.safeParse(input);
  if (!parsed.success) return { error: schemaError(parsed.error) };
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  return createPatient(ctx, parsed.data);
}

export async function searchCatalogueAction(query: string) {
  const ctx = await requireBusiness();
  return searchCatalogue(ctx, query);
}

export async function createCatalogueInlineAction(kind: "product" | "service", input: { name: string; code?: string; description?: string; unit?: string; sellingPrice: string; taxClassification?: string; taxRate?: string }) {
  const parsed = catalogueSchema.safeParse(input);
  if (!parsed.success) return { error: schemaError(parsed.error) };
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  if (kind === "product") {
    const saved = await saveProduct(ctx, null, parsed.data);
    return { id: saved.product.id, kind, name: saved.product.name, code: saved.product.sku, description: saved.product.description, unit: saved.product.unit, price: saved.product.sellingPrice, taxRate: saved.product.taxRate };
  }
  const saved = await saveService(ctx, null, parsed.data);
  return { id: saved.id, kind, name: saved.name, code: saved.code, description: saved.description, unit: saved.unit, price: saved.defaultPrice, taxRate: saved.taxRate };
}

export async function saveSettingsAction(_state: { error?: string }, form: FormData) {
  try {
    const ctx = await requireBusiness();
    requireSubscription(ctx);
    const input: SettingsInput = {
      displayName: String(form.get("displayName") ?? ""),
      legalName: String(form.get("legalName") ?? ""),
      address: String(form.get("address") ?? ""),
      phone: String(form.get("phone") ?? ""),
      email: String(form.get("email") ?? ""),
      gstin: String(form.get("gstin") ?? ""),
      invoicePrefix: String(form.get("invoicePrefix") ?? "INV"),
      invoiceFooter: String(form.get("invoiceFooter") ?? ""),
      terms: String(form.get("terms") ?? ""),
      currency: String(form.get("currency") ?? "INR"),
      defaultDueDays: Number(form.get("defaultDueDays") ?? 0),
      brandColor: String(form.get("brandColor") ?? ""),
      logoDataUrl: String(form.get("logoDataUrl") ?? ""),
    };
    await saveSettings(ctx, input);
    redirect("/settings?saved=1");
  } catch (error) {
    redirectError(error);
    return { error: publicError(error, "Settings could not be saved.") };
  }
}
