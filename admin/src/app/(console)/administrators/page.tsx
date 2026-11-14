import { connection } from "next/server";

import { ActionForm, controlClass, Field } from "@/components/admin/action-form";
import { PageSuspense } from "@/components/admin/page-suspense";
import { Pager } from "@/components/admin/pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { administratorStatusAction, inviteAdministratorAction, removeRoleAction } from "@/server/actions";
import { listAdministrators, listRoles } from "@/server/administrators";
import { pageNumber } from "@/server/validate";

export const instant = false;

export default function AdministratorsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return (
    <PageSuspense>
      <AdministratorsContent searchParams={searchParams} />
    </PageSuspense>
  );
}

async function AdministratorsContent({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await connection();
  const page = pageNumber((await searchParams).page);
  const [{ rows: administrators, total }, roles] = await Promise.all([listAdministrators(page), listRoles()]);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Administrators</h1>
        <p className="text-sm text-muted-foreground">Invited administrators sign in with an email code. There is no public registration and no default password.</p>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left"><tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Roles</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {administrators.map((administrator) => (
              <tr key={administrator.id} className="border-b last:border-0">
                <td className="p-3">{administrator.name}</td>
                <td className="p-3">{administrator.email}</td>
                <td className="p-3">{administrator.roles.map((role) => <Badge key={role} variant="secondary">{role}</Badge>)}</td>
                <td className="p-3">
                  <form action={administratorStatusAction}>
                    <input type="hidden" name="id" value={administrator.id} />
                    <input type="hidden" name="status" value={administrator.status === "active" ? "disabled" : "active"} />
                    <Button size="sm" variant="outline" type="submit">{administrator.status === "active" ? "Deactivate" : "Enable"}</Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} path="/administrators" />
      {roles.length > 0 ? (
        <div className="max-w-xl">
          <h2 className="mb-3 font-semibold">Invite administrator</h2>
          <ActionForm action={inviteAdministratorAction} submitLabel="Invite">
            <Field label="Name"><input className={controlClass} name="name" required /></Field>
            <Field label="Email"><input className={controlClass} type="email" name="email" required /></Field>
            <Field label="Role">
              <select className={controlClass} name="roleId">
                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </Field>
          </ActionForm>
          <form action={removeRoleAction} className="mt-4 grid gap-2">
            <p className="text-sm font-medium">Remove a role</p>
            <select className={controlClass} name="id">{administrators.map((administrator) => <option key={administrator.id} value={administrator.id}>{administrator.email}</option>)}</select>
            <select className={controlClass} name="roleId">{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
            <div><Button variant="outline" type="submit">Remove role</Button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
