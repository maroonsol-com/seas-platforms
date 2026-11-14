"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

import { cn } from "cn";

export const DialogRoot = Dialog.Root;
export const DialogTrigger = Dialog.Trigger;
export const DialogClose = Dialog.Close;

export function DialogContent({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40" />
      <Dialog.Popup className={cn("fixed top-1/2 left-1/2 z-50 grid max-h-[90vh] w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-background p-5 shadow-lg", className)}>
        <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
