"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

const inputClass = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function LoginForm() {
  const router = useRouter();
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    if (pending || (cooldown > 0 && stage === "code")) return;
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await response.json() as { status?: string; message?: string };
    setPending(false);
    if (body.status === "accepted") {
      setStage("code");
      setCooldown(60);
      setMessage(null);
      return;
    }
    setMessage(body.message ?? "The verification code could not be sent.");
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">Use the email address of a clinic member.</p>
        {message ? <p role="alert" className="mt-4 text-sm">{message}</p> : null}
        {stage === "email" ? (
          <form className="mt-6 grid gap-4" method="dialog" onSubmit={(event) => void requestCode(event)}>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="email">Email
              <input id="email" className={inputClass} name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send verification code"}</Button>
          </form>
        ) : (
          <form className="mt-6 grid gap-4" method="dialog" onSubmit={(event) => void verifyCode(event)}>
            <p className="text-sm">A verification code was sent to <span className="font-medium break-all">{email}</span>.</p>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="code">Verification code
              <input
                id="code"
                className={inputClass}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
            <Button type="submit" disabled={pending || code.length !== 6}>{pending ? "Verifying…" : "Verify and sign in"}</Button>
            <div className="flex items-center justify-between gap-3 text-sm">
              <button type="button" className="text-muted-foreground underline-offset-4 hover:underline" onClick={() => { setStage("email"); setCode(""); setMessage(null); }}>Change email</button>
              <button type="button" className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50" disabled={pending || cooldown > 0} onClick={() => void requestCode()}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
