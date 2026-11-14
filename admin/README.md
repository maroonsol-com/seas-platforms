# Admin application

Central administration app for the SaaS platform. It is an independent Next.js application and will use only the Admin Neon database.

Phase 1 is the foundation: the app shell, shared workspace imports, and Drizzle configuration. Authentication, the product registry, and business management are not built yet.

## Run

From the repository root:

```bash
pnpm dev:admin
```

Open http://localhost:3000.

## Database commands

Run these from the repository root. They read `admin/.env` and refuse placeholder credentials. They do not connect to the Clinic database.

```bash
pnpm --filter @saas/admin db:generate
pnpm --filter @saas/admin db:migrate
pnpm --filter @saas/admin db:check
pnpm --filter @saas/admin db:studio
```

No migrations exist yet. Do not run them against production.
