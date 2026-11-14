import { connection } from "next/server";
import Link from "next/link";

import { BoundForm } from "@/components/clinic/bound-form";
import { controlClass } from "@/components/clinic/format";
import { Pager } from "@/components/clinic/pager";
import { Button } from "@/components/ui/button";
import { requireBusiness, requireSubscription } from "@/server/access";
import { createPatientAction } from "@/server/actions";
import { pageNumber } from "@/server/constants";
import { listPatients } from "@/server/patients";

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; active?: string; page?: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  const params = await searchParams;
  const active = params.active === "inactive" || params.active === "all" ? params.active : "active";
  const page = pageNumber(params.page);
  const { rows, total } = await listPatients(ctx, { page, query: params.q, active });
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Patients</h1>
      <form className="flex flex-wrap gap-2">
        <input className="h-9 min-w-48 flex-1 rounded-lg border px-3 text-sm" name="q" defaultValue={params.q} placeholder="Name, patient ID, mobile, or email" />
        <select className="h-9 rounded-lg border px-2 text-sm" name="active" defaultValue={active}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <Button type="submit" variant="outline">Search</Button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left"><tr><th className="p-3">Patient</th><th className="p-3">Mobile</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {rows.map((patient) => (
              <tr key={patient.id} className="border-b">
                <td className="p-3"><Link className="underline" href={`/patients/${patient.id}`}>{patient.fullName}</Link><div className="text-xs text-muted-foreground">{patient.patientNumber}</div></td>
                <td className="p-3">{patient.mobile}</td>
                <td className="p-3">{patient.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan={3}>No patients yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} path="/patients" params={{ q: params.q, active }} />
      <BoundForm action={createPatientAction} submitLabel="Add patient">
        <h2 className="font-semibold">New patient</h2>
        <input className={controlClass} name="fullName" placeholder="Full name" required />
        <input className={controlClass} name="mobile" placeholder="Mobile" required />
        <input className={controlClass} name="email" type="email" placeholder="Email" />
        <input className={controlClass} name="dateOfBirth" type="date" />
        <select className={controlClass} name="gender" defaultValue="unknown"><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="unknown">Unknown</option></select>
        <textarea className="min-h-16 rounded-lg border px-3 py-2 text-sm" name="address" placeholder="Address" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmDuplicate" value="yes" /> Keep a separate record if this mobile number already exists</label>
      </BoundForm>
    </div>
  );
}
