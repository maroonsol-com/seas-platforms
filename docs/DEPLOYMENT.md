# Deployment

Admin and Clinic deploy from this monorepo as separate Vercel projects. They are not deployed. Phase 5 prepared the applications, applied one Clinic migration, and verified production builds locally. Vercel credentials, the GitHub remote, and a commit history are not available in this environment, so no project was created and no production URL exists.

The lockfile and workspace file stay at the repository root:

- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `package.json` with `"packageManager": "pnpm@10.22.0"`

## Projects

| Vercel project | Root directory | Domain placeholder | Database |
| --- | --- | --- | --- |
| `saas-admin` | `admin` | `admin.yourdomain.com` | Admin Neon database |
| `clinic-management` | `clinic-client` | `clinic.yourdomain.com` | Clinic Neon database |

Create one Vercel project per application from the same Git repository. Do not deploy both apps from one project. Do not create a second GitHub repository for either application.

`admin.yourdomain.com` and `clinic.yourdomain.com` are placeholders. No DNS records were created and neither domain is connected.

## What must exist before the first deploy

1. This repository needs at least one commit and a GitHub remote. Git is initialized on `main`, and there are no commits and no remotes.
2. Install the Vercel CLI and sign in, or import the GitHub repository from the Vercel dashboard. `vercel` and `gh` are not installed here, and `VERCEL_TOKEN` is unset.
3. Set `CLINIC_PROVISIONING_SECRET` to the same new value on both projects. It is unset in both local environment files.
4. Set Admin `CLINIC_APP_URL` to the Clinic origin. It is unset locally. Owner invitation links use the Clinic product URL, which falls back to this value.
5. Keep the Admin and Clinic `DATABASE_URL` values different. Keep the `AUTH_SECRET` values different. Both differences are already true in the local files.
6. Do not set `ADMIN_BOOTSTRAP_CONFIRM` on Vercel. The Super Admin account already exists in the Admin database.

## Import each project

1. In Vercel, import the Git repository once for Admin and again for Clinic.
2. Set the Root Directory to `admin` or `clinic-client`.
3. Leave **Include source files outside of the Root Directory in the Build Step** enabled. Shared packages live in `packages/`, outside each application directory.
4. Framework preset: **Next.js**.
5. Leave the default install and build commands. Vercel detects `pnpm-lock.yaml` at the repository root and installs the workspace from there. The application `build` script is `next build`.
6. Node.js 20.9 or newer. Local production builds used Node.js 24.
7. Set `ENABLE_EXPERIMENTAL_COREPACK` to `1` so Vercel uses the pinned pnpm 10.22.0 from `packageManager`.
8. Do not set an Output Directory override. Next.js on Vercel serves the build itself.
9. Set the build command to `pnpm db:deploy` for each project. Do not use `db:push` or `bootstrap`. The deploy command migrates that project's database and then runs `next build`. See `docs/DATABASE_MIGRATIONS.md`.

If an install cannot see the workspace, override only the install command:

```bash
cd .. && pnpm install --frozen-lockfile
```

The build command stays `pnpm db:deploy`, run from the Root Directory.

Each `next.config.ts` sets `outputFileTracingRoot` and `turbopack.root` to the monorepo root so shared source outside the application directory is included.

## Environment variables

Set variables on the Vercel project. Do not commit them, and do not prefix private values with `NEXT_PUBLIC_`.

Admin project `saas-admin`:

```text
APP_DATABASE_TARGET=admin
DATABASE_URL=<Admin pooled Neon URL>
DATABASE_URL_UNPOOLED=<Admin direct Neon URL>
DATABASE_NAME=<database name from the Neon connection details>
DATABASE_IDENTITY=admin-production
AUTH_SECRET=<unique Admin secret>
APP_URL=https://admin.yourdomain.com
CLINIC_APP_URL=https://clinic.yourdomain.com
CLINIC_PROVISIONING_SECRET=<same value as the Clinic project>
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
ENABLE_EXPERIMENTAL_COREPACK=1
```

Clinic project `clinic-management`:

```text
APP_DATABASE_TARGET=clinic
DATABASE_URL=<Clinic pooled Neon URL>
DATABASE_URL_UNPOOLED=<Clinic direct Neon URL>
DATABASE_NAME=<database name from the Neon connection details>
DATABASE_IDENTITY=clinic-production
AUTH_SECRET=<unique Clinic secret>
APP_URL=https://clinic.yourdomain.com
CLINIC_PROVISIONING_SECRET=<same value as the Admin project>
ADMIN_APP_URL=https://admin.yourdomain.com
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
ENABLE_EXPERIMENTAL_COREPACK=1
```

`DATABASE_URL` is the pooled runtime connection. `DATABASE_URL_UNPOOLED` is the direct connection used by `db:migrate` and `db:deploy`. The deploy command does not fall back to the pooled URL. `DATABASE_NAME` checks the PostgreSQL name. `DATABASE_IDENTITY` is the separate identity recorded in the database. The four values are `admin-development`, `admin-production`, `clinic-development`, and `clinic-production`. See `docs/DATABASE_MIGRATIONS.md`. Do not put either connection string in a `NEXT_PUBLIC_` variable.

`APP_URL` is the public origin for logout redirects, OTP mail that names the sign-in page, and the administrator invitation link. Cookie `Secure` is set when `NODE_ENV` is `production`, which Vercel sets. Session cookies are `HttpOnly` and `SameSite=Lax`.

Use a different Neon database and a different `AUTH_SECRET` for each project. Production and Preview can use different databases. Do not point Preview at the production database unless that is a deliberate choice.

SMTP values are present in both local environment files. On 12 November 2026 each application's mail server accepted one configuration-check message addressed to its own `SMTP_FROM`. That is server acceptance, not confirmation that a mailbox received it. No one-time code was emailed. Do not put one-time codes in logs. A failed send logs a redacted SMTP error and does not log the message body.

## Domains

When the real domain is known:

1. Attach `admin.yourdomain.com` to project `saas-admin` and `clinic.yourdomain.com` to project `clinic-management`.
2. Set Admin `APP_URL` and Clinic `APP_URL` to the `https://` origins that Vercel is serving.
3. Set Admin `CLINIC_APP_URL` to the Clinic origin. Owner invitation links are `{clinic origin}/invite?token=...`. Clinic accepts that link at `/invite`. Clinic also needs `ADMIN_APP_URL` set to the Admin origin and the same `CLINIC_PROVISIONING_SECRET` as Admin.
4. Use HTTPS. Do not invent DNS records. Do not treat a domain as connected until Vercel reports it is verified.

The PHP storage host is a later subdomain such as `files.yourdomain.com`. It is not part of this deployment. Invoice PDFs are generated in the Clinic application and do not need the PHP service.

## Skipping unaffected builds

Both applications depend on `@saas/shared` and `@saas/auth-core`. A commit that changes only `clinic-client/` should not deploy Admin. A commit that changes only `admin/` should not deploy Clinic. A commit that changes `packages/` or the lockfile deploys both.

Vercel treats files outside the workspace, such as `docs/`, as a global change and can deploy every project. To skip those commits, set the Ignored Build Step on each project to a command run from the repository root:

```bash
bash scripts/vercel-affected.sh admin
```

```bash
bash scripts/vercel-affected.sh clinic-client
```

Exit 0 skips the deployment. Exit 1 builds it. The script was checked locally against a temporary git history. It has not been executed by Vercel.

The first real commit has no parent. The script then exits 1 and builds the project, which is the right behavior for the first deployment.

## Production migrations

The Vercel build command for each project is `pnpm db:deploy`. It migrates only that project's direct database and then builds Next.js. A migration failure stops the build. Do not use `db:push` against production. Do not reset either database. Do not rerun an already applied migration. Do not roll back an applied migration from the deployment script.

```bash
pnpm --filter @saas/admin db:deploy
pnpm --filter @saas/clinic-client db:deploy
```

Admin deployment must not migrate the Clinic database, and the reverse is also true. Each command reads its own environment and refuses a target that does not match `APP_DATABASE_TARGET`. The full procedure, lock, and review rules are in `docs/DATABASE_MIGRATIONS.md`.

Do not run `db:deploy` against the current Neon databases until `DATABASE_IDENTITY` is set and `db:identify` has been run once on that database. Deploy does not create the identity row. The one-time commands, and which database each one targets, are in `docs/DATABASE_MIGRATIONS.md`. They have not been run.

Applied histories:

- Admin Neon: through `admin/drizzle/0002_big_shadowcat.sql`. Admin was not migrated in Phase 5.
- Clinic Neon: through `clinic-client/drizzle/0011_sad_proudstar.sql`. Phase 5 added `credit_total` and replaced the invoice balance checks and total functions. Applied files `0000` through `0010` were not rewritten.

## Rollback

Vercel can promote the previous deployment of one project without touching the other project. Roll back Admin and Clinic separately.

Do not roll the Clinic application back to a build from before Phase 5 while `credit_total` is in use. That older build writes `balance = total - amount_paid` and will fail the current balance check when a credit note exists. Leave migration `0011` in place. Do not drop `credit_total`.

A database restore is a Neon point-in-time restore of that one database. Restoring Admin does not restore Clinic.

## Local commands verified in Phase 5

```bash
pnpm typecheck
pnpm lint
pnpm build:admin
pnpm build:clinic
pnpm --filter @saas/clinic-client exec tsx scripts/phase5-verify.ts
```

`pnpm lint` completed with no warnings. Both production builds completed. The Clinic verification script passed against the Clinic Neon database. Details are in `DEVELOPMENT_PROGRESS.md`.
