import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BoundForm } from "@/components/clinic/bound-form";
import { controlClass, money } from "@/components/clinic/format";
import { requireBusiness, requireSubscription } from "@/server/access";
import { updatePatientAction } from "@/server/actions";
import { listInvoices } from "@/server/invoices";
import { getPatient } from "@/server/patients";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  const { id } = await params;
  const detail = await getPatient(ctx, id);
  if (!detail) notFound();
  const history = await listInvoices(ctx, { page: 1, query: detail.patient.patientNumber });
  const patient = detail.patient;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h1 className="text-2xl font-semibold">{patient.fullName}</h1>
        <p className="text-sm text-muted-foreground">{patient.patientNumber} · {patient.mobile}</p>
        <h2 className="mt-6 font-semibold">History</h2>
        <ul className="mt-2 grid gap-1 text-sm">
          {detail.records.map((record) => <li key={record.id}>{record.title}: {record.details}</li>)}
          {detail.records.length === 0 ? <li className="text-muted-foreground">No clinical notes yet.</li> : null}
        </ul>
        <h2 className="mt-6 font-semibold">Invoices</h2>
        <ul className="mt-2 grid gap-1 text-sm">
          {history.rows.filter((row) => row.patient_number === patient.patientNumber).map((row) => (
            <li key={row.id}><Link className="underline" href={`/invoices/${row.id}`}>{row.invoice_number}</Link> · {money(row.total ?? "0")} · {row.status}</li>
          ))}
        </ul>
      </div>
      <BoundForm action={updatePatientAction.bind(null, patient.id)} submitLabel="Save patient">
        <input className={controlClass} name="fullName" defaultValue={patient.fullName} required />
        <input className={controlClass} name="mobile" defaultValue={patient.mobile} required />
        <input className={controlClass} name="email" defaultValue={patient.email ?? ""} />
        <input className={controlClass} name="dateOfBirth" type="date" defaultValue={patient.dateOfBirth ?? ""} />
        <select className={controlClass} name="gender" defaultValue={patient.gender}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="unknown">Unknown</option></select>
        <textarea className="min-h-16 rounded-lg border px-3 py-2 text-sm" name="address" defaultValue={patient.address ?? ""} />
        <input className={controlClass} name="allergies" placeholder="Add an allergy note" />
        <input className={controlClass} name="history" placeholder="Add medical history" />
        <textarea className="min-h-16 rounded-lg border px-3 py-2 text-sm" name="notes" defaultValue={patient.notes ?? ""} placeholder="Notes" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" value="no" defaultChecked={!patient.isActive} /> Mark inactive</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmDuplicate" value="yes" /> Keep this record if the mobile number matches another patient</label>
      </BoundForm>
    </div>
  );
}
