# Development progress

Status after Phase 5. Admin and Clinic are prepared for separate Vercel projects and are not deployed. Phase 6 has not been started.

## Phase 5 — production readiness

Completed as a local and Clinic Neon preparation on 12 November 2026. Not deployed. Not verified on a production URL.

### Implemented

- Multi-page invoice and receipt PDFs. Later pages repeat the document identity and table headings, long text wraps, totals move together, and page numbers are added after the pages exist. Historical invoices keep their snapshotted branding.
- Server-side pages of 20 for Clinic patients, products, services, invoices, and payments, and for Admin businesses, subscriptions, plans, products, payments, administrators, and audit logs. Filtered counts use the same filters as the list. Page links keep the current search and filters.
- Credit notes reduce collectible balance through `credit_total` without changing the original invoice total or recorded cash. Refunds reduce cash only. Reports keep outstanding, customer credit, credit notes, and refunds separate. Migration `0011_sad_proudstar.sql` was applied to the Clinic Neon database only.
- The invoice editor reads patient and line values with `useWatch`. Clinic lint reports no `watch` warning.
- Administrator invitation sends a sign-in link after the account is saved. The message does not contain a one-time code.
- Failed SMTP sends log a redacted error and do not log the message body.

### Migrations applied

Clinic `0011_sad_proudstar.sql`. Admin was not migrated. Applied migrations `0000` through `0010` were not rewritten. The database was not reset.

### Tests executed

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed, and both production builds typechecked again |
| `pnpm lint` | Passed with no warnings |
| `pnpm build:admin` | Passed |
| `pnpm build:clinic` | Passed |
| `pnpm --filter @saas/clinic-client exec tsx scripts/phase5-verify.ts` | Passed against the Clinic Neon database |

The Clinic script checked a one-item PDF, a 50-item PDF with a long description, page count, the last item, the total, the trailing note, and page numbers. It then checked an unpaid credit, a second credit up to the original total, rejection of a credit above that total, a credit after full payment, a refund of that customer credit, a partial payment plus a partial credit, rejection of a payment above the remaining balance, and the finance summary totals for that clinic.

### SMTP

The Admin mail server and the Clinic mail server each accepted one configuration-check message sent to that application's own `SMTP_FROM`. The mailbox was not opened. No one-time code was sent. No owner invitation was sent. No administrator invitation was sent. Inbox delivery is not confirmed.

### Deployment

Not deployed. Git has no commits and no remote. `vercel` and `gh` are not installed. `VERCEL_TOKEN` is unset. No Vercel project was created. No domain was attached. `admin.yourdomain.com` and `clinic.yourdomain.com` remain placeholders.

`CLINIC_APP_URL` and `CLINIC_PROVISIONING_SECRET` are unset in both local environment files. The Admin and Clinic database URLs differ. The authentication secrets differ. `ADMIN_BOOTSTRAP_CONFIRM` is unset.

### Not verified in a browser this phase

Pagination controls and the credit-note balance labels were not walked in a browser. The accounting and PDF bytes were checked against Neon and in the PDF library. Production smoke tests were not run because there is no deployment.

### Outstanding

- Connect GitHub and Vercel, then create `saas-admin` and `clinic-management` with the settings in `docs/DEPLOYMENT.md`.
- Set the matching provisioning secret and the Clinic application URL before provisioning from the deployed Admin app.
- Confirm a real mailbox receives OTP and invitation mail. OTP delivery was confirmed by the user before this pass. This pass did not open a mailbox and did not send a new invitation.
- Set `CLINIC_APP_URL` on Admin, `ADMIN_APP_URL` on Clinic, and the same `CLINIC_PROVISIONING_SECRET` on both before an owner invitation can be accepted.
- Production `APP_URL` for each application must be the origin the browser uses. Origin checks reject state-changing requests from any other origin.
- PHP storage is not configured. Invoice PDFs do not need it.

### Next phase

Do not start Phase 6 until it is explicitly approved.

## Phase 4 — Clinic invoicing MVP

Completed on 12 November 2026. Not deployed. Phase 5, recorded above, later changed PDF paging, list paging, and credit-note accounting.

### Implemented

- Clinic email OTP, session cookie, business selection from membership, branch filtering, permission checks, and subscription gating. Missing, expired, or suspended subscriptions leave invoices and payments readable and block writes.
- Dashboard and reports from the Clinic database. Invoiced value, discounts, tax, collected payments, refunds, credit notes, and outstanding receivables are separate. Profit is not reported.
- Patients on the existing `patients` table, with search, profile, edit, invoice history, and an invoice dialog that saves the patient before selecting them. A repeated mobile number warns and does not merge the records.
- Products and services on the existing catalogue tables. Invoice lines do not create stock movements. Deactivating a catalogue item leaves finalized invoice lines in place.
- Draft invoices, atomic finalization, `invoice_sequences` numbering, and line and issuer snapshots. Drafts are cancelled rather than deleted.
- Payments, partial payments, idempotency, refunds, credit notes, receipts, and outstanding balances. A payment cannot exceed the balance.
- Authorized invoice and receipt PDFs, print, and per-business branding. INR is the default currency and the currency is stored explicitly.

### Migrations applied

Clinic `0009_curious_wasp.sql` and `0010_lyrical_ben_parker.sql`. Admin was not migrated. Applied Clinic migrations `0000` through `0008` were not rewritten.

### Tests executed

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed. Clinic then had one warning: React Hook Form `watch` in the invoice editor. Phase 5 removed it |
| `pnpm db:boundaries` | Passed. Clinic migrations through `0010` |
| Clinic `db:check` | Passed |
| `pnpm build:admin` | Passed |
| `pnpm build:clinic` | Passed, including the finalize button association |
| `pnpm --filter @saas/clinic-client exec tsx scripts/phase4-verify.ts` | 13 checks passed against the Clinic Neon database |

The 13 checks covered patient create, duplicate warning, search and update, cross-business patient denial, catalogue create and search, no stock movement, cross-business catalogue denial, a draft with products and services, finalization and a second finalization rejection, snapshot price stability, concurrent invoice numbers, payments, idempotency, refund, overpayment rejection, cross-business payment denial, PDF snapshot text and cross-business denial, catalogue deactivation, and OTP login through a test sender.

### Browser

The sign-in page accepted an unknown address with the generic message and did not reveal whether the address exists. A headless Chrome session then opened the dashboard, the narrow menu, patients, products, services, reports, and settings. On a new invoice it saved a patient from the dialog, saved a product from the item dialog, saved a draft, finalized it, downloaded a PDF, recorded a payment, opened the receipt, and logged out.

### Not verified

- SMTP delivery. The OTP check replaced the mail sender and did not send a message.
- A logo image in the browser. The PDF draws a stored PNG or JPEG data URL when one was snapshotted at finalization.
- Vercel deployment. Not started.

### Known limits

- Patient profiles can mark a patient inactive. An inactive patient cannot be added to a new invoice. Existing invoice history stays.
- Verification clinics and their invoices remain. Invoice, patient, payment, and audit deletes are rejected.
- Appointments, consultations, prescriptions, and inventory deduction remain deferred.

## Phase 3 — Central Admin App

Completed on 12 November 2026. Not deployed.

### Completed

- Super Admin bootstrap for the named account, idempotent, Admin database only, confirmation required, audited, no password printed.
- Email OTP request, verify, resend cooldown, expiry, invalid codes, session cookie, logout, and revocation.
- Admin shell and working pages for dashboard, products, businesses, plans, subscriptions, payments, administrators, audit, and settings.
- Clinic Management product, with the application URL left for `CLINIC_APP_URL` when it is empty.
- Business onboarding and signed Clinic provisioning, including a failed attempt that creates no subscription and a repeat that does not duplicate the clinic business or owner membership.
- Subscription assign, suspend, and entitlement snapshot. Payment recording does not change the expiry date.
- Last Super Admin cannot be disabled or removed.
- Audit update is rejected by the database.

### Migrations applied

- Admin `0002_big_shadowcat.sql`
- Clinic `0006_good_garia.sql`, `0007_provision_service.sql`, `0008_fix_provision_function.sql`

### Tests executed

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed for shared, auth-core, admin, and clinic before the final page edits. The production build then typechecked both applications |
| `pnpm lint` | Passed |
| `pnpm db:boundaries` | Passed. Admin migrations through `0002`. Clinic migrations through `0008` |
| Admin and Clinic `db:check` | Passed |
| `pnpm build:admin` | Passed |
| `pnpm build:clinic` | Passed |
| `ADMIN_BOOTSTRAP_CONFIRM=yes pnpm --filter @saas/admin bootstrap` | Passed. Account confirmed, role already assigned, Clinic product already present |
| `pnpm --filter @saas/admin exec tsx scripts/phase3-verify.ts` | 14 checks passed against the configured Neon databases |
| Browser sign-in | Request for an unauthorized address showed the generic message. A fixture code signed in, the dashboard, products, and businesses rendered stored data, the narrow layout opened the menu, and logout returned to the sign-in page |

The 14 checks covered subscription date rules, bootstrap idempotency, audit immutability, OTP without a stored code when delivery is not used, OTP verify and session revocation, product save without storing a secret, authorization, last Super Admin protection, partial provisioning failure, provisioning idempotency against the Clinic database, payment recording, suspension, and dashboard counts.

Verification rows remain in both databases. Deletes of businesses, subscriptions, payments, and audit rows are rejected.

### Not verified

- SMTP delivery. The suite replaced the mail sender and did not send a message.
- A deployed Clinic URL. `CLINIC_APP_URL` and `CLINIC_PROVISIONING_SECRET` are unset. The provisioning test called the Clinic route handler in the same process and wrote to the Clinic Neon database.
- Vercel deployment. Not started.

### Next phase

Phase 4 was later approved and is recorded above. This phase did not deploy.

## Phase 1 — monorepo foundation

Completed on 11 November 2026.

### Completed

- Empty repository inspected. There was no existing application code.
- Git initialized on branch `main`. No commit has been created.
- pnpm 10.22.0 workspace created for `admin`, `clinic-client`, and `packages/*`.
- Independent Next.js 16.4.6 applications created for Admin and Clinic.
- TypeScript strict mode, Tailwind CSS 4, shadcn/ui, and Lucide icons configured in both applications.
- `@saas/shared` and `@saas/auth-core` created and imported by both applications.
- Separate Drizzle configurations added. They refuse placeholder credentials and do not share a schema.
- `.env` files added with placeholders and gitignored.
- Architecture, database, security, storage, and Vercel deployment docs added.

### Not implemented

- Database tables and migrations.
- Admin login, dashboard, products, businesses, plans, subscriptions, or payments.
- Clinic patients, appointments, billing, or any other clinic module.
- PHP storage API. `storage-server/php/` contains only a note that it is reserved.
- Production deployment. No Vercel project or Neon database has been created.

### Files created

- Root: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore`, `README.md`
- `admin/` and `clinic-client/`: Next.js apps, shadcn components, Drizzle config, database guard, `.env`
- `packages/shared/`, `packages/auth-core/`
- `docs/MASTER_ARCHITECTURE.md`, `docs/ADMIN_APP.md`, `docs/CLINIC_APP.md`, `docs/DATABASE_ARCHITECTURE.md`, `docs/STORAGE_API.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`
- `scripts/vercel-affected.sh`
- `storage-server/php/README.md`

### Database changes

None. `admin/drizzle/` and `clinic-client/drizzle/` were not created.

`db:generate` was run for both applications. Both exited 1 before opening a connection because `DATABASE_URL_UNPOOLED` is still a placeholder. A Clinic-shaped URL exported in the shell did not override `clinic-client/.env`.

### Tests executed

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed for shared, auth-core, admin, and clinic |
| `pnpm lint` | Passed for admin and clinic |
| `pnpm build:admin` | Passed. Next.js 16.4.6, static `/` and `/api/health` |
| `pnpm build:clinic` | Passed. Next.js 16.4.6, static `/` and `/api/health` |
| Admin dev server | Ready at http://localhost:3000. Home and health returned 200 |
| Clinic dev server | Ready at http://localhost:3001. Home and health returned 200 |
| Browser | Admin and Clinic pages rendered. Desktop is two columns at 1280px. Mobile stacks at 390px. No horizontal overflow |
| Affected-project script | In a temporary git repo: a Clinic-only commit builds Clinic and skips Admin; a `packages/` commit builds both; a docs-only commit skips both |

The rendered pages show values imported from the shared packages: platform name, database ownership, `saas_admin_session`, `saas_clinic_session`, and the five-minute OTP policy. Health JSON does not include credentials.

OTP hashing functions typecheck. They are not called by a route, so they were not executed.

### Known issues

- shadcn's component download for Clinic timed out once. `card`, `badge`, and `separator` were copied from the Admin app, which had just installed the same registry components.
- `pnpm db:generate` exited 1 during Phase 1 because the Neon URL was a placeholder. Phase 2 changed `db:generate` and `db:check` so they validate SQL without a connection. `db:migrate` still exits 1 on a placeholder.

### Missing credentials

- Admin Neon pooled URL and direct URL.
- Clinic Neon pooled URL and direct URL. It must be a different database.
- `AUTH_SECRET` for each application, generated separately.
- SMTP host, port, user, password, and from address. Email is not sent.
- Vercel projects, domains, and PHP hosting are not configured.

### Pending

Phase 2, after approval: separate Admin and Clinic schemas, migrations, constraints, and indexes. Do not mix the schemas. Do not run a migration until the matching Neon URL is present.

## Phase 2 — database foundation

Completed on 11 November 2026. Phase 1 was inspected before these changes. The pnpm workspace and shared packages were kept. No Admin or Clinic product UI was added.

### Completed

- Separate Drizzle schemas for Admin (20 tables) and Clinic (41 tables).
- Independent migration histories:
  - `admin/drizzle/0000_lush_genesis.sql`
  - `admin/drizzle/0001_platform_integrity.sql`
  - `clinic-client/drizzle/0000_keen_mephistopheles.sql`
  - `clinic-client/drizzle/0001_tenant_protections.sql`
- UUID keys, restrictive foreign keys, indexes, and `numeric` money columns.
- Clinic RLS policies, forced RLS, transaction-local tenant settings, and `resolveBusinessAccess()`.
- Database triggers that preserve clinical, financial, audit, and stock records, and that keep one product per business.
- `db:generate` and `db:check` run without a database. `db:migrate` still refuses placeholder URLs.
- `docs/DATABASE_ARCHITECTURE.md` and `docs/SECURITY.md` updated.

### Not implemented

- Applying migrations. Both Neon URLs are still placeholders.
- Connectivity tests against Neon.
- Login, dashboards, and the rest of the Admin and Clinic UI.
- PHP storage.

### Database changes

Schemas and SQL were generated and inspected. No migration was applied. `db:migrate` for both applications exits 1 with the placeholder refusal and does not open a connection.

### Tests executed

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed for shared, auth-core, admin, and clinic |
| `pnpm lint` | Passed for admin and clinic |
| `pnpm --filter @saas/admin db:generate` | Passed. Wrote `admin/drizzle/0000_lush_genesis.sql` without opening a connection |
| `pnpm --filter @saas/clinic-client db:generate` | Passed. Wrote `clinic-client/drizzle/0000_keen_mephistopheles.sql` without opening a connection |
| Custom migrations | Passed. `0001_platform_integrity.sql` and `0001_tenant_protections.sql` |
| `pnpm --filter @saas/admin db:check` | Passed. Drizzle reported the schema matches the snapshots |
| `pnpm --filter @saas/clinic-client db:check` | Passed. Drizzle reported the schema matches the snapshots |
| `pnpm db:boundaries` | Passed. Histories stay separate, money is `numeric`, SQL contains no connection string |
| `node --experimental-strip-types clinic-client/src/server/tenant-access.test.ts` | Passed. 4 tests, 0 failed. Node warned that the Clinic package is not marked as a module and reparsed the file as ESM |
| `pnpm --filter @saas/admin db:migrate` | Exited 1. Placeholder refusal. No connection opened. This is the expected safety check |
| `pnpm --filter @saas/clinic-client db:migrate` | Exited 1. Placeholder refusal. No connection opened. This is the expected safety check |
| `pnpm build:admin` | Passed. Next.js 16.4.6, static `/` and `/api/health` |
| `pnpm build:clinic` | Passed. Next.js 16.4.6, static `/` and `/api/health` |
| Neon connectivity | Not run. Both database URLs are still placeholders |
| Live RLS and trigger tests | Not run. The SQL has not been applied |

### Known issues

- Live RLS, trigger, and exclusion-constraint behavior is untested until the SQL is applied to Neon.
- `users` and `permissions` have no RLS. User listings must be scoped through memberships in application code.
- A draft invoice line, draft prescription medicine, and draft purchase line can be deleted. Issued and finalized records cannot.

### Missing credentials

- Admin Neon pooled URL and direct URL.
- Clinic Neon pooled URL and direct URL. It must be a different database.
- SMTP host, port, user, password, and from address. Email is not sent.
- Vercel projects, domains, and PHP hosting are not configured.

`AUTH_SECRET` is present in both `.env` files. Those values are not database credentials and are not recorded here.

### Pending

Phase 3 was approved and is complete. Phase 4 waits for explicit approval.

## Phase 2 verification — 12 November 2026

The configured `DATABASE_URL` values are Neon pooled URLs. `DATABASE_URL_UNPOOLED` was missing. The direct host was derived by removing the pooler marker, checked against the same database, and saved as `DATABASE_URL_UNPOOLED`. The pooled values were not overwritten. Admin and Clinic hosts are different databases.

### Applied

- Admin: `0000_lush_genesis.sql`, `0001_platform_integrity.sql`. Two migrations. 20 tables.
- Clinic: `0000_fat_overlord.sql` through `0005_fix_invoice_guard.sql`. Six migrations. 42 tables.
- The first generated Clinic file omitted enum types and could not be applied. It was regenerated before anything was committed to the Clinic database.
- Invoice snapshots, catalogue fields, invoice numbering, calculation triggers, and the `clinic_app` role were added after the base schema.

### Live results

`pnpm --filter @saas/clinic-client db:verify-live` executed against Neon. 44 checks passed and 0 failed. That run covered pooled HTTP connectivity for both applications, membership isolation, browser business-id rejection, cross-business reads and updates, appointment overlap, clinical and financial preservation, stock ledger behavior, catalogue snapshots, partial payments, refunds, credit notes, concurrent invoice numbers, and pooled and direct transaction cleanup.

Catalog queries confirmed Admin foreign keys, unique indexes, 13 triggers, and `numeric(14,2)` money columns. Catalog queries confirmed Clinic foreign keys, composite business keys, 40 row-level security policies, forced row-level security on 40 tables, `btree_gist`, the appointment exclusion constraint, 36 triggers, and numeric money and stock columns.

The Neon owner role has `BYPASSRLS`. Tenant transactions switch to `clinic_app` for that reason. Verification rows remain in the Clinic database because clinical and financial deletes are rejected.

### Still not done

- Admin and Clinic product screens.
- SMTP, Vercel, and PHP hosting.
- Removing the verification rows. They are labeled with the verification stamp and are not production data.

