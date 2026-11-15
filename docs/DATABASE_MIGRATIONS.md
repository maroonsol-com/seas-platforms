# Database migrations

Admin and Clinic keep separate Neon databases, separate Drizzle journals, and separate `drizzle.__drizzle_migrations` histories. A migration command never chooses a database from a shared variable. It reads the application directory it was started from.

Drizzle remains the only migration system. The runner uses the journal order, the SQL files, and the same SHA-256 file hash and `created_at` timestamp that Drizzle records. It does not create a second history table.

## Commands

From the repository root:

```bash
pnpm --filter @saas/admin db:check
pnpm --filter @saas/admin db:generate
pnpm --filter @saas/admin db:status
pnpm --filter @saas/admin db:migrate
pnpm --filter @saas/admin db:verify
pnpm --filter @saas/admin db:deploy

pnpm --filter @saas/clinic-client db:check
pnpm --filter @saas/clinic-client db:generate
pnpm --filter @saas/clinic-client db:status
pnpm --filter @saas/clinic-client db:migrate
pnpm --filter @saas/clinic-client db:verify
pnpm --filter @saas/clinic-client db:deploy
```

| Command | What it does |
| --- | --- |
| `db:check` | Confirms journal order and file hashes, then runs Drizzle Kit's schema check. It does not open a database. |
| `db:generate` | Asks Drizzle Kit to write the next SQL file. Review that file before committing it. |
| `db:status` | Read-only report of applied and pending tags, plus whether `platform_administrators` or `patients` is present. It does not apply SQL. |
| `db:migrate` | Applies only pending migrations, then checks that the history matches the journal. |
| `db:verify` | Fails if the history is inconsistent or any committed migration is still pending. |
| `db:deploy` | Runs `db:migrate` and, only after that succeeds, runs `next build`. |

`db:push`, database reset, and `drizzle-kit push` are not deployment commands. Do not use them against a shared or production database.

## Generate and review

1. Change the Drizzle schema in that application only.
2. Run `db:generate` from that application.
3. Open the new file in `admin/drizzle/` or `clinic-client/drizzle/`.
4. Confirm the SQL is additive, or get an explicit review if it is not.
5. Commit the SQL file and the journal together. Do not edit a migration that has already been applied.

An applied file is identified by its hash. Rewriting it makes the next verification fail.

## Automatic Vercel migrations

Each Vercel project has its own root directory, so a root `package.json` script does not run for both. Set the project commands explicitly.

Install command, both projects, run from the application directory:

```bash
cd .. && pnpm install --frozen-lockfile
```

Admin project `saas-admin`, root directory `admin`:

```bash
pnpm db:deploy
```

Clinic project `clinic-management`, root directory `clinic-client`:

```bash
pnpm db:deploy
```

`db:deploy` validates the target, checks the database identity, takes the migration lock, applies pending migrations, verifies the history, and only then builds Next.js. A failure at any earlier step exits non-zero, so Vercel does not publish that build.

Leave **Include source files outside of the Root Directory** enabled. The runner lives in `scripts/` and the shared packages live in `packages/`.

Set `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the pinned pnpm version.

## Required variables

Set these on the Vercel project and in the local application `.env`. The file wins over a variable exported in the shell.

| Variable | Admin | Clinic |
| --- | --- | --- |
| `APP_DATABASE_TARGET` | `admin` | `clinic` |
| `DATABASE_URL` | Pooled runtime URL | Pooled runtime URL |
| `DATABASE_URL_UNPOOLED` | Direct URL | Direct URL |
| `DATABASE_NAME` | Database name from the Neon connection details | Database name from the Neon connection details |
| `NEON_ENDPOINT_ID` | Endpoint id, such as `ep-example-id` | A different endpoint id |

`DATABASE_URL_UNPOOLED` is required. The runner does not fall back to `DATABASE_URL`.

`DATABASE_NAME` and `NEON_ENDPOINT_ID` are not secrets. In the Neon console, open the connection string. The host looks like `ep-example-id.region.aws.neon.tech` or `ep-example-id-pooler.region.aws.neon.tech`. `NEON_ENDPOINT_ID` is the first host label with `-pooler` removed. `DATABASE_NAME` is the database path, often `neondb`. Both applications can use the same database name only when their endpoint ids differ. The runner also refuses a database that already contains the other application's tables: `patients` for Admin, `platform_administrators` for Clinic.

A local disposable database uses `NEON_ENDPOINT_ID=local` and a `127.0.0.1` or `localhost` host. `local` is rejected for a Neon host.

`MIGRATION_APPROVED_TAGS` is optional. It is a comma-separated list of journal tags that a person has reviewed. It is not a blanket approval.

## Identity checks

Before any migration SQL runs, the runner:

1. Requires `APP_DATABASE_TARGET` to match the application that owns the command.
2. Parses both URLs and requires the same database name and the same endpoint id.
3. Rejects a direct URL whose host contains `-pooler`.
4. Requires `DATABASE_NAME` and `NEON_ENDPOINT_ID` to match that parsed identity.
5. After connecting, requires `current_database()` to match `DATABASE_NAME`.
6. Rejects Admin when `public.patients` exists, and Clinic when `public.platform_administrators` exists.
7. Rejects a history whose hashes belong to the other application's journal.

The full connection string is not printed. A mismatch says which check failed.

## What runs automatically

Pending migrations run in journal order, one transaction each. A migration is recorded only after its SQL commits. The recorded hash and timestamp are the Drizzle values, so a later Drizzle read sees the same history.

These operations can run without `MIGRATION_APPROVED_TAGS`:

- Creating tables, indexes, functions, and constraints.
- Adding a nullable column, or a `NOT NULL` column that has a default.
- Adding a `NOT NULL` column without a default only when the table has no rows.
- Replacing a constraint that the same migration creates again.
- `REVOKE` on a function that the same migration creates.
- Enum values on PostgreSQL 12 or newer, inside the migration transaction.

These stop the deployment until the tag is listed in `MIGRATION_APPROVED_TAGS`:

- `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, `TRUNCATE`, `DELETE`, or a top-level `UPDATE`.
- A column type change or `SET NOT NULL`.
- `DROP POLICY`, or `REVOKE` on an object this migration did not create.
- `DROP CONSTRAINT` when the same migration does not create that constraint again.
- A `NOT NULL` column without a default when the table already has rows.
- `CREATE INDEX CONCURRENTLY`, `VACUUM`, or `ALTER TYPE ... ADD VALUE` on PostgreSQL older than 12. Those statements cannot be committed and recorded atomically, so the runner refuses them instead of leaving a partial change.

The runner does not roll back a migration that has already committed. If a later migration fails, the earlier ones stay applied and the failed tag is not recorded. Fix the SQL forward, or restore that one Neon branch from a point in time, then deploy again. Do not delete rows or rewrite an applied file to force a retry.

## Concurrency

Admin takes PostgreSQL advisory lock `(81422011, 1)`. Clinic takes `(81422011, 2)`. The lock is held on the migration connection from the history check through the last commit. The session releases it when the process exits or the connection drops, including after a crash. There is no lock row left behind. A second deployment waits up to 120 seconds, then fails if the lock is still held. It does not apply the same migration twice.

## Another application later

Add a new workspace application with its own directory, `APP_DATABASE_TARGET`, Drizzle folder, advisory-lock key, and foreign-table guard. Do not point it at the Admin or Clinic journal or database. Add its directory to `pnpm-workspace.yaml` only when that product is requested.

## Local test

`pnpm test:migrations` starts a disposable Postgres cluster, applies fixture migrations and the committed Admin and Clinic journals, and removes the cluster. It does not use the Neon URLs.
