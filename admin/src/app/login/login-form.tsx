"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { controlClass, Field } from "@/components/admin/action-form";

export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function requestCode(event: { currentTarget: HTMLElement }) {
    const form = event.currentTarget.closest("form");
    if (!form) return;
    const email = String(new FormData(form).get("email") ?? "");
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await response.json() as { message?: string };
    setPending(false);
    setMessage(body.message ?? "The request could not be completed.");
  }

  async function verifyCode(event: { currentTarget: HTMLElement }) {
    const form = event.currentTarget.closest("form");
    if (!form) return;
    const data = new FormData(form);
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: String(data.get("email") ?? ""),
        code: String(data.get("code") ?? ""),
      }),
    });
    const body = await response.json() as { message?: string; ok?: boolean };
    setPending(false);
    if (body.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setMessage(body.message ?? "That code is invalid or has expired.");
  }

  return (
    <form
      className="mx-auto grid w-full max-w-md gap-6 px-4 py-16"
      onSubmit={(event) => {
        event.preventDefault();
        void requestCode(event);
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold">Admin sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">Use the email address of an authorized platform administrator. A one-time code is sent by email.</p>
      </div>
      {message ? <p role="alert" className="text-sm">{message}</p> : null}
      <Field label="Email">
        <input className={controlClass} name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Sign-in code">
        <input className={controlClass} name="code" inputMode="numeric" autoComplete="one-time-code" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Email me a code
        </Button>
        <Button type="button" disabled={pending} onClick={(event) => void verifyCode(event)}>
          Verify
        </Button>
      </div>
    </form>
  );
}
