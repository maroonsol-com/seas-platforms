# Clinic application

The Clinic application in `clinic-client/` is the first product. It is a separate Next.js application from Admin. It will use only the Clinic Neon database.

## Current status

Phase 5 production preparation is implemented in `clinic-client/` and is not deployed. Admin can still provision a clinic through `POST /api/internal/provision` and push subscription status through `POST /api/internal/entitlements`. Both routes require a signed server request. They are not browser endpoints.

The Clinic application has email OTP sign-in, business selection from membership, and these screens:

- Dashboard, with invoiced value, collected cash, outstanding receivables, customer credit, refunds, credit notes, drafts, and overdue invoices
- Patients, products, services, invoices, and payments. Each list is 20 rows from the server, with the filtered count, search, and the filters already on that screen. Page changes keep those filters.
- Invoice drafts, finalization, list, view, print, and authorized PDF download. Invoice and receipt PDFs add pages when the content does not fit. Later pages repeat the title, the invoice or receipt identity, and the table headings. Page numbers are drawn after the last page exists. Totals move to the next page as a block instead of being clipped. The PDF uses the branding snapshotted on the invoice.
- Payments, partial payments, refunds, credit notes, and receipts
- Reports that separate billed value, collected cash, outstanding receivables, customer credit, refunds, and credit notes
- Clinic branding settings

Catalogue prices and tax rates are read from the Clinic database when a draft is saved. The browser preview is not the financial record. Draft invoices cannot be deleted, because the database rejects invoice deletes. Cancel a draft, or cancel a finalized invoice that has no recorded payment.

A credit note reduces what the patient still owes. It does not rewrite the original invoice total, and it is not a cash refund. Cash changes only when a payment or a refund is recorded. `balance = total - amount_paid - credit_total`. Outstanding reports sum the positive balances. A negative balance is customer credit. Issued credits cannot exceed the original total. Several credit notes are allowed until that cap. A full credit against an unpaid invoice stays finalized, because no cash was collected.

Owner invitation links open `/invite` on the Clinic origin. The page asks for the invited email, sends the existing one-time code, and accepts the invitation only after that code is verified. The token is stored as a hash in the Admin database. Acceptance does not grant access to any other clinic. `ADMIN_APP_URL` must be the Admin origin so Clinic can validate the invitation. These modules are not built:

- Staff invitation acceptance beyond the owner link
- Appointments, doctors, and staff screens
- Consultations, vitals, and prescriptions screens
- Inventory quantity changes, purchases, and expenses
- PHP storage uploads and downloads

Clinic subscription access reads `subscription_snapshots` on the Clinic server. Access continues through the expiry date in the business timezone and stops on the next local day. A suspended snapshot, or a missing snapshot, removes write access immediately. Invoice and payment history, including PDF download, stays readable. Creating or changing records waits until the subscription is active.

## Invoice creation screen

This is the required interaction for the invoicing workflow. Patient and item choices come from the current business's database.

1. Patient dropdown with search. Search the current business's `patients` rows by name, patient number, and mobile number. Show useful details after selection: name, patient number, mobile, email, date of birth, gender, and address. A patient from another business must not appear.
2. Add New Patient button inside the patient selection area.
3. Patient creation popup. Fields: patient name, mobile number, email, date of birth, gender, and address. Saving validates the input, inserts a `patients` row for the current business, and selects that patient on the invoice. The patient stays in the database for later invoices and appointments.
4. Item dropdown with search. Load active `products` and `services` for the current business. Search by name or code. Selecting an item fills description, unit, selling price, tax classification, and tax rate.
5. Add New Item button inside the item selection area.
6. Product or service creation popup. The user chooses Product or Service, then enters name, description, SKU or code where it applies, unit, selling price, and tax information. Saving inserts a `products` or `services` row for the current business and adds that item to the invoice. Services do not change stock. Products keep their inventory fields on the product row.
7. Multiple invoice lines. Each line stores the catalogue id and a snapshot of the name, description, code, unit, quantity, unit price, discount, tax classification, tax rate, tax amount, and line total.
8. Quantity, price, discount, and tax. The user can change quantity and a permitted discount. PostgreSQL calculates tax and line totals. The browser total is only a preview.
9. Live invoice summary. Show subtotal, discount, tax, total, amount paid, and balance from the invoice row.
10. Save as draft or finalize. Finalizing runs in one transaction, assigns the next invoice number from `invoice_sequences`, and freezes the line snapshots. Changing a catalogue price later does not change the issued invoice.

Server rules that the screen must call:

- Resolve the business from the authenticated membership.
- Reject a patient, product, or service that belongs to another business.
- Validate quantity and money on the server. Money is `numeric`. Do not treat JavaScript floating-point arithmetic as the financial record.
- Send payment retries with the payment idempotency key.

## Planned boundary

The Clinic database will store operational clinic data for every clinic business using this product. Tenant-owned records will carry `business_id`. The browser will not be trusted to choose that id.

Subscription status will come from a signed server-to-server entitlement check or a local snapshot maintained by that integration. The Clinic browser will not receive Admin database credentials, and the Clinic server will not query the Admin database directly.

## Local commands

```bash
pnpm dev:clinic
pnpm build:clinic
pnpm --filter @saas/clinic-client typecheck
pnpm --filter @saas/clinic-client lint
pnpm --filter @saas/clinic-client db:generate
```

The development server uses port 3001. `GET /api/health` reports the clinic application and does not return credentials.

## Environment

Required in `clinic-client/.env` and, later, in the Clinic Vercel project:

| Variable | Purpose |
| --- | --- |
| `APP_DATABASE_TARGET` | Must be `clinic` |
| `DATABASE_URL` | Pooled Clinic Neon URL for runtime |
| `DATABASE_URL_UNPOOLED` | Direct Clinic Neon URL for migrations |
| `AUTH_SECRET` | Clinic session and OTP secret. Must differ from Admin |
| `APP_URL` | Public Clinic origin, `http://localhost:3001` locally |
| `CLINIC_PROVISIONING_SECRET` | Same value as Admin. Verifies provisioning and entitlement requests |
| `ADMIN_APP_URL` | Admin origin used to validate owner invitations |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Email delivery for clinic sign-in codes |

The same variable names are used in Admin. Each Vercel project has its own values.
