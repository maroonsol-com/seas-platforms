# Admin application

The Admin application in `admin/` is the control panel for the platform. Only platform administrators can enter it. Clinic staff do not use this application, and it does not query the Clinic database.

## Phase 5 status

The Admin workflows below are in place and the production build passes. The application is not deployed. Businesses, subscriptions, plans, products, payments, administrators, and audit logs page 20 rows at a time with a filtered or total count. Business filters stay in the page links. Inviting an administrator saves the account and then emails a sign-in link when SMTP accepts the message. The email does not contain a one-time code. On 12 November 2026 the Admin mail server accepted a configuration-check message. A mailbox was not read, and no administrator invitation was sent during that check.

## Phase 3 status

The essential admin workflows are in place:

- Email one-time-code sign-in, resend, expiry, invalid codes, rate limiting, sessions, logout, and session revocation.
- Dashboard counts and recent payments and activity from the Admin database.
- Product registry, including the Clinic Management product.
- Business create, search, filter, edit, suspend, and reactivate.
- Signed provisioning into the Clinic application, with retry after failure.
- Subscription plans and subscription changes. Recording a payment does not renew a subscription.
- Manual payments.
- Administrator invite, role assignment, deactivation, and protection of the last Super Admin.
- Append-only audit logs.

There is no public administrator registration and no default password. Plan prices are entered by an administrator. No Clinic price is seeded.

## Super Admin bootstrap

The bootstrap script writes only to the Admin database. It is not an HTTP route.

```bash
ADMIN_BOOTSTRAP_CONFIRM=yes pnpm --filter @saas/admin bootstrap
```

Without `ADMIN_BOOTSTRAP_CONFIRM=yes` the script exits and changes nothing. The initial account is Manjeet Chandra, `majormchandra@gmail.com`, role `SUPER_ADMIN`, status active, timezone `Asia/Kolkata`, locale `en-IN`. Running it again updates the name, display name, timezone, and locale, and keeps a single Super Admin role assignment. It does not reset a disabled account and it does not print a password or one-time code.

Sign-in codes are emailed only when SMTP is configured. The verification suite replaces the mail sender and does not send a message. A separate configuration check, recorded in `docs/DEPLOYMENT.md`, was accepted by the SMTP server and did not include a code.

## Provisioning

Creating a business writes the Admin business, its product link, and a pending provisioning row in one transaction. Provisioning then sends a signed request to the Clinic route `POST /api/internal/provision`. Clinic creates the clinic business, owner user, membership, owner role, and main branch in its own database. A repeat of the same platform business id does not create a second clinic business.

The signing secret is read from the environment variable named by the product integration row, normally `CLINIC_PROVISIONING_SECRET`. The name is stored. The value is not. After a successful provision, Admin creates the requested subscription and an owner invitation. If the Clinic call fails, the Admin row is `failed`, no subscription is created, and an authorized administrator can retry.

Provisioning labels in the interface are `PENDING`, `PROVISIONING`, `PROVISIONED`, and `FAILED`. The stored values remain `pending`, `in_progress`, `succeeded`, and `failed`.

## Local commands

```bash
pnpm dev:admin
pnpm build:admin
pnpm --filter @saas/admin typecheck
pnpm --filter @saas/admin lint
pnpm --filter @saas/admin db:migrate
pnpm --filter @saas/admin exec tsx scripts/phase3-verify.ts
```

The development server uses port 3000. `allowedDevOrigins` includes `127.0.0.1`, so the dev server accepts that host as well as `localhost`. `GET /api/health` does not return credentials.

## Environment

| Variable | Purpose |
| --- | --- |
| `APP_DATABASE_TARGET` | Must be `admin` |
| `DATABASE_URL` | Pooled Admin Neon URL |
| `DATABASE_URL_UNPOOLED` | Direct Admin Neon URL for migrations |
| `AUTH_SECRET` | Admin OTP and session secret. Not shared with Clinic |
| `APP_URL` | Public Admin origin |
| `CLINIC_APP_URL` | Clinic application origin used when the product URL is still empty |
| `CLINIC_PROVISIONING_SECRET` | Shared with Clinic. Signs provisioning and entitlement requests |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Email delivery for sign-in codes and invitations |
| `ADMIN_BOOTSTRAP_CONFIRM` | Set to `yes` only for the bootstrap command. Do not leave it on a server |

`CLINIC_APP_URL` and `CLINIC_PROVISIONING_SECRET` are not set in the current Admin environment file. Provisioning from the running app waits on those values. The Clinic project needs the same provisioning secret before either side can call the other. Do not put secrets in `NEXT_PUBLIC_` variables. Do not set `ADMIN_BOOTSTRAP_CONFIRM` on Vercel.
