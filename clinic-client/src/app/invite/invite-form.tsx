"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { invitationMessage, type InvitationState } from "@/lib/invitation-state";

const inputClass = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function InviteForm({
  token,
  state,
  businessName,
}: {
  token: string;
  state: InvitationState;
  businessName: string | null;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(state === "valid" ? null : invitationMessage(state));
  const [pending, setPending] = useState(false);

  if (state !== "valid") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <section className="w-full max-w-sm rounded-xl border border-border bg-background p-6">
          <p className="text-sm font-medium text-muted-foreground">Clinic</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Invitation</h1>
          <p role="alert" className="mt-4 text-sm">{message}</p>
        </section>
      </main>
    );
  }

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/invite/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, email }),
    });
    const body = await response.json() as { ok?: boolean; message?: string };
    setPending(false);
    if (body.ok) {
      setStage("code");
      return;
    }
    setMessage(body.message ?? "The invitation could not be continued.");
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/invite/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, email, code }),
    });
    const body = await response.json() as { ok?: boolean; message?: string; next?: string };
    setPending(false);
    if (body.ok) {
      router.push(body.next ?? "/dashboard");
      router.refresh();
      return;
    }
    setMessage(body.message ?? "That code is invalid or has expired.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-sm rounded-xl border border-border bg-background p-6">
        <p className="text-sm font-medium text-muted-foreground">Clinic</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Accept invitation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {businessName ? `You were invited to ${businessName}.` : "Confirm the invited email address to continue."} A verification code is sent only when the email matches the invitation.
        </p>
        {message ? <p role="alert" className="mt-4 text-sm">{message}</p> : null}
        {stage === "email" ? (
          <form className="mt-6 grid gap-4" method="dialog" onSubmit={(event) => void sendCode(event)}>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="invite-email">Email
              <input id="invite-email" className={inputClass} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <Button type="submit" disabled={pending}>{pending ? "Checking…" : "Send verification code"}</Button>
          </form>
        ) : (
          <form className="mt-6 grid gap-4" method="dialog" onSubmit={(event) => void verify(event)}>
            <p className="text-sm">A verification code was sent to <span className="font-medium break-all">{email}</span>.</p>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="invite-code">Verification code
              <input id="invite-code" className={inputClass} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
            </label>
            <Button type="submit" disabled={pending || code.length !== 6}>{pending ? "Verifying…" : "Verify and sign in"}</Button>
            <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => { setStage("email"); setCode(""); setMessage(null); }}>Change email</button>
          </form>
        )}
      </section>
    </main>
  );
}
