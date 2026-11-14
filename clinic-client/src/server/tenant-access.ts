/**
 * Clinic business access comes from an authenticated membership.
 * A business id sent by the browser is never the source of access.
 */
export class TenantAccessError extends Error {
  constructor() {
    super("Business access was denied.");
    this.name = "TenantAccessError";
  }
}

export function resolveBusinessAccess(input: {
  membershipBusinessId: string | null | undefined;
  browserBusinessId?: string | null;
}): string {
  const membershipBusinessId = input.membershipBusinessId?.trim() ?? "";

  if (membershipBusinessId.length === 0) {
    throw new TenantAccessError();
  }

  const browserBusinessId = input.browserBusinessId?.trim() ?? "";
  if (browserBusinessId.length > 0 && browserBusinessId !== membershipBusinessId) {
    throw new TenantAccessError();
  }

  return membershipBusinessId;
}
