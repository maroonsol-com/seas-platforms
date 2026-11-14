# SaaS Platform

One Admin application and one Clinic application, in a pnpm workspace. Each application is an independent Next.js app with its own Neon PostgreSQL database and its own Vercel project.

Phase 1 is the monorepo foundation. Product features, database tables, and the PHP storage API are not built yet.

## Requirements

- Node.js 20.9 or newer. This repository was created with Node.js 24.
- pnpm 10.22.0. Corepack uses the `packageManager` field in the root `package.json`.

```bash
corepack enable
corepack prepare pnpm@10.22.0 --activate
pnpm install
```

## Run

```bash
pnpm dev:admin
```

Admin: http://localhost:3000

```bash
pnpm dev:clinic
```

Clinic: http://localhost:3001

The two servers can run at the same time. They do not share a session or a database.

## Build and check

```bash
pnpm typecheck
pnpm lint
pnpm build:admin
pnpm build:clinic
```

## Layout

| Path | Role |
| --- | --- |
| `admin/` | Central Admin Next.js application |
| `clinic-client/` | Clinic Management Next.js application |
| `packages/shared` | Shared types, constants, validators, and utilities |
| `packages/auth-core` | OTP and cookie primitives. No login flow yet |
| `storage-server/php` | Reserved for the PHP storage API. Not implemented |
| `docs/` | Architecture, database, security, and deployment notes |

## Credentials

`admin/.env` and `clinic-client/.env` contain placeholders. They are gitignored. Replace them with two different Neon databases before any migration. Generate a different `AUTH_SECRET` for each application:

```bash
openssl rand -base64 32
```

SMTP is empty, so email is not sent. No payment gateway is configured.

## Database commands

```bash
pnpm --filter @saas/admin db:generate
pnpm --filter @saas/clinic-client db:generate
```

With placeholder URLs, `db:generate` and `db:check` write and validate SQL without opening a connection. `db:migrate` still refuses placeholders. See [docs/DATABASE_ARCHITECTURE.md](docs/DATABASE_ARCHITECTURE.md).

## Documentation

- [Architecture](docs/MASTER_ARCHITECTURE.md)
- [Admin](docs/ADMIN_APP.md)
- [Clinic](docs/CLINIC_APP.md)
- [Databases](docs/DATABASE_ARCHITECTURE.md)
- [Storage](docs/STORAGE_API.md)
- [Security](docs/SECURITY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Progress](DEVELOPMENT_PROGRESS.md)

## Adding a future product

When a new product is requested, add a new root folder, a new workspace entry, a new Neon database, and a new Vercel project. Do not add its tables to the Clinic database, and do not create another Admin application.
