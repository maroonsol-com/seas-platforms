import { WRITE_PERMISSIONS, type ClinicPermission } from "./constants";
import { ClinicError } from "./errors";

export type ClinicContext = {
  userId: string;
  businessId: string;
  permissions: string[];
  subscriptionAllowed: boolean;
  timezone: string;
  branchIds: string[];
};

export function assertPermission(ctx: ClinicContext, permission: ClinicPermission): void {
  if (!ctx.permissions.includes(permission)) {
    throw new ClinicError("You do not have permission for this action.");
  }
  if (WRITE_PERMISSIONS.has(permission) && !ctx.subscriptionAllowed) {
    throw new ClinicError("This clinic subscription does not allow changes. Open the subscription page for the current status.");
  }
}
