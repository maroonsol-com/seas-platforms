# Master architecture

This repository is a multi-product SaaS platform in one pnpm workspace. Each product is its own Next.js application, its own Neon PostgreSQL database, and its own Vercel project. One Admin application manages the platform. Product applications do not share databases or sessions.

Phase 1 creates that foundation. Later phases add schemas, the Admin product, file storage, and the Clinic product. Those phases are not implemented.

## Applications

| Application | Directory | Package | Local port | Database |
| --- | --- | --- | --- | --- |
| Admin | `admin/` | `@saas/admin` | 3000 | Admin Neon database |
| Clinic | `clinic-client/` | `@saas/clinic-client` | 3001 | Clinic Neon database |

Future products are new root-level applications, for example `school-client/` or `retail-client/`. Each one gets its own database, Drizzle configuration, Vercel project, and domain. They are not created until requested. The Admin application is not copied for each product.

## Workspace

```text
saas_platforms/
├── admin/
├── clinic-client/
├── packages/
│   ├── shared/
│   └── auth-core/
├── storage-server/php/    # reserved; not implemented
├── docs/
├── package.json
└── pnpm-workspace.yaml
```

`packages/shared` holds types, constants, Zod validators, and small utilities. `packages/auth-core` holds OTP and cookie primitives. Neither package opens a database or stores a secret.

Shared TypeScript is allowed. A shared database package is not. Admin code must not import the Clinic schema, and Clinic code must not import the Admin schema.

## How the applications stay separate

- Each application has its own `package.json`, `next.config.ts`, `tsconfig.json`, source tree, and `.env`.
- Each application has its own Drizzle config, schema directory, and future migration history.
- `DATABASE_URL` means the pooled runtime connection for that application only. The variable name is the same in both apps. The values must be different Neon databases.
- `DATABASE_URL_UNPOOLED` is the direct connection used for migrations of that same database.
- `APP_DATABASE_TARGET` must be `admin` or `clinic` and must match the application that is running the command.
- Session cookie names are `saas_admin_session` and `saas_clinic_session`.
- `AUTH_SECRET` is different in each application.

A change in one application does not require a deploy of the other, unless the change is in a shared package that both applications depend on.

## What is intentionally absent

- Admin authentication screens, product registry, businesses, plans, subscriptions, and payments.
- Clinic patients, appointments, consultations, billing, inventory, and reports.
- The PHP storage API.
- Real Neon, SMTP, Vercel, and PHP hosting credentials.
- Generated or applied migrations.

See [DATABASE_ARCHITECTURE.md](./DATABASE_ARCHITECTURE.md), [DEPLOYMENT.md](./DEPLOYMENT.md), and [SECURITY.md](./SECURITY.md).
