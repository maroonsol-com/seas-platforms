import { Database, KeyRound, Layers3, Shield } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type FoundationScreenProps = {
  platformName: string;
  applicationName: string;
  packageName: string;
  port: number;
  databasePurpose: string;
  envFile: string;
  drizzleConfig: string;
  sessionCookie: string;
  otpTtlMinutes: number;
  otpMaxAttempts: number;
};

export function FoundationScreen({
  platformName,
  applicationName,
  packageName,
  port,
  databasePurpose,
  envFile,
  drizzleConfig,
  sessionCookie,
  otpTtlMinutes,
  otpMaxAttempts,
}: FoundationScreenProps) {
  return (
    <div className="flex flex-1 flex-col bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium">{applicationName}</p>
              <p className="text-xs text-muted-foreground">{platformName}</p>
            </div>
          </div>
          <Badge variant="secondary">Phase 1 foundation</Badge>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
        <div className="max-w-2xl space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Central administration
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            This application is the single control panel for every SaaS
            product. It has its own deployment, session, and Neon database.
            Product modules are not built yet.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers3 className="size-4" aria-hidden="true" />
                Independent application
              </CardTitle>
              <CardDescription>Next.js App Router</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Package: {packageName}</p>
              <p>Local port: {port}</p>
              <p>Shared imports: @saas/shared, @saas/auth-core</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="size-4" aria-hidden="true" />
                Admin database
              </CardTitle>
              <CardDescription>Not connected in this phase</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{databasePurpose}</p>
              <p>Environment file: {envFile}</p>
              <p>Drizzle config: {drizzleConfig}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4" aria-hidden="true" />
                Separate authentication
              </CardTitle>
              <CardDescription>Login is not implemented yet</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Session cookie: {sessionCookie}</p>
              <p>
                OTP lifetime prepared: {otpTtlMinutes} minutes, {otpMaxAttempts}{" "}
                attempts
              </p>
              <p>Email delivery waits for SMTP credentials.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Waiting for Phase 2</CardTitle>
              <CardDescription>Approved work stops after this foundation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>No product registry, businesses, or subscriptions.</p>
              <p>No clinic records and no PHP file storage.</p>
              <p>No migrations have been generated or applied.</p>
            </CardContent>
          </Card>
        </div>

        <Separator />

        <p className="text-sm text-muted-foreground">
          Run this app with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
            pnpm dev:admin
          </code>
          . The Clinic application runs separately on port 3001.
        </p>
      </main>
    </div>
  );
}
