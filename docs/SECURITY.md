# Security

Admin and Clinic sign-in, sessions, and tenant authorization are implemented. File storage is not. This document does not claim a privacy certification.

## Separate applications

Admin and Clinic have different directories, secrets, cookie names, and databases.

| Boundary | Admin | Clinic |
| --- | --- | --- |
| Cookie name | `saas_admin_session` | `saas_clinic_session` |
| Secret | `admin/.env` `AUTH_SECRET` | `clinic-client/.env` `AUTH_SECRET` |
| Database target | `APP_DATABASE_TARGET=admin` | `APP_DATABASE_TARGET=clinic` |

`packages/auth-core` can be imported by both applications. It does not create a shared session. Cookie options are `HttpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV` is `production`.

## OTP and admin sessions

Admin sign-in uses the shared OTP helpers. A 6-digit code is hashed with the Admin `AUTH_SECRET` and stored in `administrator_otp_challenges`. The raw code is not stored and is not returned by the API. Codes expire after five minutes, allow five attempts, and a new code is not sent during the 60-second cooldown. Five requests in an hour are ignored for that address.

The request response does not say whether the address is an administrator. When SMTP cannot send, the challenge is removed. Unknown addresses receive the same accepted response as known addresses once SMTP is configured. Verification rejects an expired, reused, or incorrect code and writes `administrator.login_failed`. A successful verification writes `administrator.login`, stores only the session token hash, and sets `saas_admin_session`.

Logout and disabling an administrator set `revoked_at` on the session. A revoked, expired, or disabled session cannot open the admin pages.

There is no development bypass that accepts a fixed code, and there is no public Super Admin registration. The bootstrap command is the only way the initial account is created, and it requires `ADMIN_BOOTSTRAP_CONFIRM=yes`.

## Clinic OTP and sessions

Clinic sign-in uses the same OTP helpers with the Clinic `AUTH_SECRET`. The code hash is stored in `user_otp_challenges`. The raw code is not stored and is not returned by the API. The same expiry, attempt limit, resend cooldown, and hourly cap apply. Unknown or inactive addresses get the same accepted response as known addresses and do not store a challenge. When SMTP is not configured, no challenge is stored. A failed send deletes the challenge.

A successful code creates `user_sessions` with only the token hash and sets `saas_clinic_session`. One active membership selects that business. Several memberships go to the business chooser, and the chosen id must be one of those memberships. Logout sets `revoked_at`.

Ordinary clinic reads and writes use `withTenantTransaction()` or `withUserTransaction()`, which run `SET LOCAL ROLE clinic_app`. The owner connection is not used for tenant invoices, patients, catalogues, or payments. `clinic_app` was not granted extra privileges in Phase 5. Browser prices, tax, totals, and payment status are not accepted as the financial record. Catalogue prices are loaded again when a draft is saved. PostgreSQL calculates tax and invoice totals. A payment is allowed only while the invoice is finalized or partially paid and the collectible balance is at least the payment. Repeating an idempotency key returns the original payment. Refunds are new rows and reduce cash collected. Credit notes are new rows and reduce what is still owed. They do not change the original invoice total and they do not create a refund. Issued credits cannot exceed that original total. Finalized invoice lines and issuer branding stay on the invoice after the catalogue or settings change. PDF routes require the same session and membership. There is no public invoice URL.

The last active Super Admin cannot be disabled and cannot lose the Super Admin role.

## Service requests

Admin calls Clinic with `POST /api/internal/provision` and `POST /api/internal/entitlements`. The body is signed with HMAC-SHA256 over the timestamp and raw body. Clinic rejects a missing, wrong, or stale signature. The secret stays in `CLINIC_PROVISIONING_SECRET` on both servers. The product row stores only the variable name.

Provisioning runs `provision_clinic_business`, a narrowly scoped security-definer function. Ordinary clinic queries still use `withTenantTransaction()` and `clinic_app`. The function does not weaken row-level security. Entitlement updates use a normal tenant transaction and write `subscription_snapshots`. Clinic access lasts through the expiry date in the subscription timezone. Suspension removes access immediately.

## Audit

Platform audit rows and administrative activity rows cannot be updated or deleted. Database triggers reject both. The application has no edit or delete action for them. Subscription history is also append-only.

## Database commands

Migration commands refuse a placeholder URL, refuse a pooled URL for migrations, and refuse a target that does not match the application. They prefer the application's own `.env` over variables already exported in the shell. Error text does not include the connection string.

`db:generate` and `db:check` can run while the URL is still a placeholder. They do not open a connection. `db:migrate` and `db:studio` still refuse placeholders.

`createDatabase()` is server-only and uses the HTTP driver as the database owner. The Neon owner has `BYPASSRLS`, so that connection does not enforce Clinic row-level security. Clinic tenant tables must be queried through `withTenantTransaction()` or `withUserTransaction()`. Those helpers set the transaction-local business and user settings and then run `SET LOCAL ROLE clinic_app`. `clinic_app` cannot bypass row-level security. The HTTP driver cannot hold that transaction, and a session-level `SET` would leak across a pooled connection.

## Tenant isolation

Clinic business access is resolved from the authenticated membership by `resolveBusinessAccess()`. A business id supplied by the browser is compared with that membership and is rejected when it differs. It is never the source of the business id.

Row-level security is enabled and forced on every Clinic table that contains tenant data. The connection role still bypasses it until the transaction switches to `clinic_app`. Policies fail closed when the transaction setting is missing. `users` and `permissions` have no row-level security: users are looked up by email before a business is chosen, and permissions are a global catalog. Application code must not list users except through memberships.

Row-level security does not replace application authorization. It only constrains statements to the business id the server already chose. Admin data is platform-wide and is not tenant-scoped. Admin and Clinic databases cannot see each other's tables.

Financial, clinical, audit, and stock rows are protected by database triggers. Deleting them, changing a finalized consultation or prescription, or rewriting issued invoice amounts is rejected in PostgreSQL. Invoice tax and line totals are calculated in PostgreSQL. Issued invoice lines keep their own snapshot of the catalogue item.

## Secrets

`.env` files are gitignored. Values in the repository are placeholders such as `USER:PASSWORD` and `ep-ADMIN-HOST`. They are not credentials. Do not put secrets in `NEXT_PUBLIC_` variables.

## Still outstanding

- CSRF tokens on cookie-authenticated form posts. SameSite=Lax is in place.
- File upload validation for a storage service. Clinic logos are PNG or JPEG data URLs on `business_settings`, limited to 250,000 characters. The PHP storage service is not connected.
- Backups and monitoring.
- Inbox confirmation of email. On 12 November 2026 the Admin SMTP server and the Clinic SMTP server each accepted one configuration-check message. The mailbox was not read, and no one-time code or invitation was sent. Sign-in verification in the test suites still uses a test sender.
- `CLINIC_PROVISIONING_SECRET` is not in the environment files, so a running Admin server cannot call Clinic until it is set to the same value in both applications.
- Owner invitation links point at `/invite` on the Clinic origin. Clinic has no page that accepts that link.

Admin mutations check a platform permission. Clinic subscription access is decided from `subscription_snapshots` on the Clinic server. Input validation for shared identifiers uses Zod. Database access goes through Drizzle.
