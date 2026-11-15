export type InvitationState = "valid" | "expired" | "accepted" | "revoked" | "invalid" | "email_mismatch" | "unavailable";

export function invitationMessage(state: InvitationState): string {
  switch (state) {
    case "expired":
      return "This invitation has expired. Ask the administrator for a new invitation.";
    case "accepted":
      return "This invitation has already been used.";
    case "revoked":
      return "This invitation has been revoked.";
    case "email_mismatch":
      return "The email does not match this invitation.";
    case "unavailable":
      return "Invitation acceptance is not available right now.";
    default:
      return "This invitation link is not valid.";
  }
}

export function membershipForInvitation(
  memberships: ReadonlyArray<{ businessId: string }>,
  invitedBusinessId: string | null,
): string | null {
  if (!invitedBusinessId) return null;
  return memberships.some((membership) => membership.businessId === invitedBusinessId) ? invitedBusinessId : null;
}
