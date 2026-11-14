"use client";

import { useActionState, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import { DialogClose, DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { controlClass, money } from "@/components/clinic/format";
import { createCatalogueInlineAction, createPatientInlineAction, saveInvoiceAction, searchCatalogueAction, searchPatientsAction } from "@/server/actions";
import type { PatientSummary } from "@/server/patients";

type Line = {
  kind: "product" | "service";
  catalogueId: string;
  name: string;
  code: string;
  description: string;
  unit: string;
  unitPrice: string;
  taxRate: string;
  quantity: string;
  discount: string;
};

type CatalogueChoice = {
  id: string;
  kind: "product" | "service";
  name: string;
  code: string | null;
  description: string;
  unit: string;
  price: string;
  taxRate: string | null;
};

function paise(value: string): bigint {
  const [whole, fraction = ""] = (value || "0").split(".");
  const digits = whole.replace(/\D/g, "") || "0";
  return BigInt(digits) * 100n + BigInt((fraction.replace(/\D/g, "") + "00").slice(0, 2));
}

function formatPaise(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function InvoiceEditor({
  invoiceId,
  branches,
  currency,
  invoiceDate,
  initial,
}: {
  invoiceId?: string;
  branches: { id: string; name: string }[];
  currency: string;
  invoiceDate: string;
  initial?: {
    patient?: PatientSummary;
    branchId: string;
    invoiceDate: string;
    dueDate: string;
    notes: string;
    lines: Line[];
    totals?: { subtotal: string; discount: string; tax: string; total: string; paid: string; balance: string };
  };
}) {
  const form = useForm({
    defaultValues: {
      patientId: initial?.patient?.id ?? "",
      branchId: initial?.branchId ?? branches[0]?.id ?? "",
      invoiceDate: initial?.invoiceDate ?? invoiceDate,
      dueDate: initial?.dueDate ?? "",
      notes: initial?.notes ?? "",
      lines: initial?.lines ?? [],
    },
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const [patient, setPatient] = useState<PatientSummary | null>(initial?.patient ?? null);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<PatientSummary[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<CatalogueChoice[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [state, action, pending] = useActionState(saveInvoiceAction, {});
  const watched = useWatch({ control: form.control, name: "lines" }) ?? [];
  const patientId = useWatch({ control: form.control, name: "patientId" }) ?? "";

  let subtotal = 0n;
  let discount = 0n;
  let tax = 0n;
  for (const line of watched) {
    const extended = paise(line.unitPrice) * paise(line.quantity) / 100n;
    const lineDiscount = paise(line.discount);
    const taxable = extended > lineDiscount ? extended - lineDiscount : 0n;
    const rate = paise(line.taxRate || "0");
    subtotal += extended;
    discount += lineDiscount;
    tax += (taxable * rate + 5000n) / 10000n;
  }
  const total = subtotal - discount + tax;

  async function findPatients(value: string) {
    setPatientQuery(value);
    setPatientResults(value.trim().length < 2 ? [] : await searchPatientsAction(value));
  }

  async function findItems(value: string) {
    setItemQuery(value);
    const results = value.trim().length < 2 ? [] : await searchCatalogueAction(value);
    setItemResults(results.map((item) => ({ ...item, code: item.code })));
  }

  function addLine(item: CatalogueChoice) {
    lines.append({
      kind: item.kind,
      catalogueId: item.id,
      name: item.name,
      code: item.code ?? "",
      description: item.description,
      unit: item.unit,
      unitPrice: item.price,
      taxRate: item.taxRate ?? "0",
      quantity: "1",
      discount: "0",
    });
    setItemQuery("");
    setItemResults([]);
  }

  return (
    <form id="invoice-form" action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      {invoiceId ? <input type="hidden" name="invoiceId" value={invoiceId} /> : null}
      <input type="hidden" name="patientId" value={patientId} />
      <div className="grid gap-4">
        {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
        {message ? <p role="status" className="text-sm">{message}</p> : null}
        <section className="grid gap-3 rounded-xl border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Patient</h2>
            <PatientDialog onCreated={(created) => { setPatient(created); form.setValue("patientId", created.id); setMessage(`${created.fullName} was added and selected.`); }} />
          </div>
          <input className={controlClass} value={patientQuery} placeholder="Search name, patient ID, or mobile" onChange={(event) => void findPatients(event.target.value)} />
          {patientResults.length > 0 ? (
            <ul className="grid gap-1 rounded-lg border p-1">
              {patientResults.map((result) => (
                <li key={result.id}>
                  <button type="button" className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { setPatient(result); form.setValue("patientId", result.id); setPatientResults([]); setPatientQuery(""); }}>
                    {result.fullName} · {result.patientNumber} · {result.mobile}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {patient ? <p className="text-sm">{patient.fullName} · {patient.patientNumber} · {patient.mobile}{patient.email ? ` · ${patient.email}` : ""}</p> : <p className="text-sm text-muted-foreground">No patient selected.</p>}
        </section>

        <section className="grid gap-3 rounded-xl border bg-background p-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm">Branch
            <select className={controlClass} {...form.register("branchId")} name="branchId">
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Invoice date
            <input className={controlClass} type="date" {...form.register("invoiceDate")} name="invoiceDate" />
          </label>
          <label className="grid gap-1 text-sm">Due date
            <input className={controlClass} type="date" {...form.register("dueDate")} name="dueDate" />
          </label>
          <label className="grid gap-1 text-sm md:col-span-3">Notes
            <textarea className="min-h-20 rounded-lg border px-3 py-2 text-sm" {...form.register("notes")} name="notes" />
          </label>
        </section>

        <section className="grid gap-3 rounded-xl border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Items</h2>
            <ItemDialog onCreated={(item) => addLine(item)} />
          </div>
          <input className={controlClass} value={itemQuery} placeholder="Search products and services" onChange={(event) => void findItems(event.target.value)} />
          {itemResults.length > 0 ? (
            <ul className="grid gap-1 rounded-lg border p-1">
              {itemResults.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <button type="button" className="flex w-full justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => addLine(item)}>
                    <span>{item.kind === "product" ? "Product" : "Service"} · {item.name}{item.code ? ` · ${item.code}` : ""}</span>
                    <span>{money(item.price, currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2">Item</th><th>Qty</th><th>Price</th><th>Discount</th><th></th></tr></thead>
              <tbody>
                {lines.fields.map((field, index) => (
                  <tr key={field.id} className="border-t">
                    <td className="py-2 pr-2">
                      <input type="hidden" name="lineKind" value={watched[index]?.kind ?? field.kind} />
                      <input type="hidden" name="catalogueId" value={watched[index]?.catalogueId ?? field.catalogueId} />
                      <div className="font-medium">{field.name}</div>
                      <input className={`${controlClass} mt-1`} name="lineDescription" defaultValue={field.description} />
                    </td>
                    <td className="py-2 pr-2"><input className={controlClass} {...form.register(`lines.${index}.quantity`)} name="quantity" /></td>
                    <td className="py-2 pr-2">{money(field.unitPrice, currency)}</td>
                    <td className="py-2 pr-2"><input className={controlClass} {...form.register(`lines.${index}.discount`)} name="discount" /></td>
                    <td className="py-2"><Button type="button" variant="outline" size="sm" onClick={() => lines.remove(index)}>Remove</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lines.fields.length === 0 ? <p className="text-sm text-muted-foreground">Search for a saved product or service, or add a new item.</p> : null}
        </section>
      </div>
      <aside className="h-fit rounded-xl border bg-background p-4 lg:sticky lg:top-4">
        <h2 className="font-semibold">Invoice total</h2>
        <p className="mt-1 text-xs text-muted-foreground">This preview updates as you type. The saved invoice uses the database totals.</p>
        <dl className="mt-3 grid gap-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(formatPaise(subtotal), currency)}</dd></div>
          <div className="flex justify-between"><dt>Discount</dt><dd>{money(formatPaise(discount), currency)}</dd></div>
          <div className="flex justify-between"><dt>Tax</dt><dd>{money(formatPaise(tax), currency)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{money(formatPaise(total), currency)}</dd></div>
          {initial?.totals ? <div className="flex justify-between"><dt>Saved balance</dt><dd>{money(initial.totals.balance, currency)}</dd></div> : null}
        </dl>
        <div className="mt-4 grid gap-2">
          <Button type="submit" name="intent" value="draft" disabled={pending}>Save draft</Button>
          <DialogRoot>
            <DialogTrigger className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground">Finalize</DialogTrigger>
            <DialogContent title="Finalize invoice">
              <p className="text-sm text-muted-foreground">Finalizing assigns the invoice number and locks the item lines. Catalogue changes after this will not change the invoice.</p>
              <div className="flex justify-end gap-2">
                <DialogClose className="inline-flex h-8 items-center rounded-lg border px-2.5 text-sm">Back</DialogClose>
                <Button type="submit" form="invoice-form" name="intent" value="finalize" disabled={pending}>Finalize invoice</Button>
              </div>
            </DialogContent>
          </DialogRoot>
        </div>
      </aside>
    </form>
  );
}

function PatientDialog({ onCreated }: { onCreated: (patient: PatientSummary) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    const data = new FormData(event.currentTarget);
    const result = await createPatientInlineAction({
      fullName: String(data.get("fullName") ?? ""),
      mobile: String(data.get("mobile") ?? ""),
      email: String(data.get("email") ?? ""),
      dateOfBirth: String(data.get("dateOfBirth") ?? ""),
      gender: (["female", "male", "other", "unknown"].includes(String(data.get("gender"))) ? String(data.get("gender")) : "unknown") as "female" | "male" | "other" | "unknown",
      address: String(data.get("address") ?? ""),
      confirmDuplicate: data.get("confirmDuplicate") === "yes",
    });
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    if ("duplicate" in result) {
      setError("A patient with this mobile number already exists. Tick the confirmation to keep both records.");
      return;
    }
    if ("patient" in result) {
      onCreated(result.patient);
      setOpen(false);
      setError(null);
    }
  }
  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger className="text-sm font-medium underline">Add new patient</DialogTrigger>
      <DialogContent title="Add new patient">
        <form className="grid gap-3" onSubmit={onSubmit}>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <input className={controlClass} name="fullName" placeholder="Full name" required />
          <input className={controlClass} name="mobile" placeholder="Mobile" required />
          <input className={controlClass} name="email" type="email" placeholder="Email" />
          <input className={controlClass} name="dateOfBirth" type="date" />
          <select className={controlClass} name="gender" defaultValue="unknown">
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="unknown">Unknown</option>
          </select>
          <textarea className="min-h-16 rounded-lg border px-3 py-2 text-sm" name="address" placeholder="Address" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmDuplicate" value="yes" /> Keep a separate record if this mobile number already exists</label>
          <Button type="submit">Save patient</Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

function ItemDialog({ onCreated }: { onCreated: (item: CatalogueChoice) => void }) {
  const [kind, setKind] = useState<"product" | "service">("service");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    const data = new FormData(event.currentTarget);
    const result = await createCatalogueInlineAction(kind, {
      name: String(data.get("name") ?? ""),
      code: String(data.get("code") ?? ""),
      description: String(data.get("description") ?? ""),
      unit: String(data.get("unit") ?? ""),
      sellingPrice: String(data.get("sellingPrice") ?? ""),
      taxClassification: String(data.get("taxClassification") ?? ""),
      taxRate: String(data.get("taxRate") ?? ""),
    });
    if ("error" in result) {
      setError(result.error ?? "The item could not be saved.");
      return;
    }
    onCreated({
      id: result.id,
      kind: result.kind,
      name: result.name,
      code: result.code ?? null,
      description: result.description,
      unit: result.unit,
      price: result.price,
      taxRate: result.taxRate ?? null,
    });
    setOpen(false);
    setError(null);
  }
  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger className="text-sm font-medium underline">Add new item</DialogTrigger>
      <DialogContent title="Add new item">
        <form className="grid gap-3" onSubmit={onSubmit}>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="button" variant={kind === "product" ? "default" : "outline"} onClick={() => setKind("product")}>Product</Button>
            <Button type="button" variant={kind === "service" ? "default" : "outline"} onClick={() => setKind("service")}>Service</Button>
          </div>
          <input className={controlClass} name="name" placeholder={kind === "product" ? "Product name" : "Service name"} required />
          <input className={controlClass} name="code" placeholder={kind === "product" ? "SKU" : "Service code"} required={kind === "product"} />
          <textarea className="min-h-16 rounded-lg border px-3 py-2 text-sm" name="description" placeholder="Description" />
          <input className={controlClass} name="unit" placeholder="Unit" defaultValue="unit" />
          <input className={controlClass} name="sellingPrice" placeholder="Selling price" required />
          <input className={controlClass} name="taxClassification" placeholder="Tax classification, if any" />
          <input className={controlClass} name="taxRate" placeholder="Tax rate %, leave empty if none" />
          <Button type="submit">Save and add</Button>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
