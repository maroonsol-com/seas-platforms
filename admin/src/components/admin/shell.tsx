"use client";

import {
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Package,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "cn";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/businesses", label: "Businesses", icon: Building2 },
  { href: "/subscriptions", label: "Subscriptions", icon: ClipboardList },
  { href: "/plans", label: "Plans", icon: Receipt },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/administrators", label: "Administrators", icon: Users },
  { href: "/audit", label: "Audit Logs", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AdminShell({ name, children }: { name: string; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-muted/30 md:grid md:grid-cols-[16rem_1fr]">
      {open ? <button className="fixed inset-0 z-30 bg-black/40 md:hidden" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-background transition-transform md:static md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Shield className="size-4" />
          <span className="font-semibold">Platform Admin</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
          <Button variant="outline" size="sm" className="md:hidden" onClick={() => setOpen(true)}>Menu</Button>
          <span className="ml-auto text-sm">{name}</span>
          <form action="/api/auth/logout" method="post">
            <Button variant="outline" size="sm" type="submit">Log out</Button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
