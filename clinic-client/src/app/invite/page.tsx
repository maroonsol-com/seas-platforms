import { Suspense } from "react";

import { previewInvitation } from "@/server/invitations";

import { InviteForm } from "./invite-form";

export const instant = false;

export default function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading invitation…</p>}>
      <InvitePreview searchParams={searchParams} />
    </Suspense>
  );
}

async function InvitePreview({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token?.trim() ?? "";
  const preview = token ? await previewInvitation(token) : { state: "invalid" as const, businessName: null };
  return <InviteForm token={token} state={preview.state} businessName={preview.businessName} />;
}
