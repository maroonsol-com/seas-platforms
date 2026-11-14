"use client";

import {
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Stethoscope,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "cn";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/products", label: "Products", icon: Package },
  { href: "/services", label: "Services", icon: Stethoscope },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/reports", label: "Reports", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

const restrictedItems = [
  { href: "/subscription", label: "Subscription", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/payments", label: "Payments", icon: CreditCard },
];

export function ClinicShell({
  name,
  businessName,
  subscriptionAllowed,
  children,
}: {
  name: string;
  businessName: string;
  subscriptionAllowed: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = subscriptionAllowed ? items : restrictedItems;

  return (
    <div className="min-h-screen bg-muted/30 md:grid md:grid-cols-[16rem_1fr] print:block print:bg-white">
      {open ? <button className="fixed inset-0 z-30 bg-black/40 md:hidden print:hidden" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-background transition-transform md:static md:translate-x-0 print:hidden", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-14 items-center border-b px-4 font-semibold">Clinic</div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {links.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", active ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4 print:hidden">
          <Button variant="outline" size="sm" className="md:hidden" onClick={() => setOpen(true)}>Menu</Button>
          <span className="truncate text-sm font-medium">{businessName}</span>
          <span className="ml-auto truncate text-sm text-muted-foreground">{name}</span>
          <form action="/api/auth/logout" method="post">
            <Button variant="outline" size="sm" type="submit">Log out</Button>
          </form>
        </header>
        {!subscriptionAllowed ? <p className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-950 print:hidden">This subscription is restricted. Invoices and receipts stay available. Changes wait until the subscription is active.</p> : null}
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
