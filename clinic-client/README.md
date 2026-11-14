# Clinic application

Clinic Management SaaS. It is an independent Next.js application and will use only the Clinic Neon database.

Phase 1 is the foundation. Patients, appointments, billing, and the rest of the clinic product are not built yet.

## Run

From the repository root:

```bash
pnpm dev:clinic
```

Open http://localhost:3001.

## Database commands

Run these from the repository root. They read `clinic-client/.env` and refuse placeholder credentials. They do not connect to the Admin database.

```bash
pnpm --filter @saas/clinic-client db:generate
pnpm --filter @saas/clinic-client db:migrate
pnpm --filter @saas/clinic-client db:check
pnpm --filter @saas/clinic-client db:studio
```

No migrations exist yet. Do not run them against production.
