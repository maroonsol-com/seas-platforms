"use client";

import { useActionState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function BoundForm({
  action,
  children,
  submitLabel = "Save",
}: {
  action: (state: { error?: string }, formData: FormData) => Promise<{ error?: string }>;
  children: ReactNode;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-3">
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {children}
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button></div>
    </form>
  );
}
