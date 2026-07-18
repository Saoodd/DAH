# Dar Al Hay Events — Vendor Management Platform

A production platform for Dar Al Hay Events (Dubai) to run the full vendor
lifecycle for curated pop-up events: account creation, business approval,
event registration, interactive booth selection, payments, and vendor
communication.

Built with Next.js (App Router) + TypeScript + Tailwind CSS + Supabase
(Auth, Postgres, Storage, Row Level Security).

## Project status — all 6 phases shipped

- **Phase 1: Foundation** — deployment fix, authentication, permanent
  business profiles, vendor/admin roles, full database schema for the
  whole platform, basic vendor/admin dashboard shell.
- **Phase 2: Approval workflow, events, applications** — admin
  approve/reject/suspend/blacklist/reconsider with audit logging, event
  CRUD (create/edit/duplicate/archive, open/close registration), and the
  vendor application flow (apply → auto-approve or admin review).
- **Phase 3: Interactive booth map, 5-minute locking, recommendations** —
  cinema-style zoom/pan floor plan with live (Realtime) status updates,
  a database-enforced 5-minute lock so two vendors can't win the same
  booth, booth changes, and a rule-based (no AI) recommendation engine.
  Full admin booth map builder (drag/resize/duplicate/delete, zones, map
  features, hold/reserve/confirm/release/swap).
- **Phase 4: Payments (ADCB Pace Pay + IBAN), expiry** — confirming a
  booth opens a payment record with a configurable deadline (default 1
  hour); ADCB Pace Pay (admin-attached link, vendor-entered reference,
  never auto-marked paid) and IBAN transfer (bank details, receipt
  upload, admin verification); self-healing expiry that releases the
  booth and preserves the application; admin confirm/reject/extend/
  reopen/refund/offline-payment controls.
- **Phase 5: Waiting list, notifications, export centre, setup check-in** —
  waiting list with priority reordering, admin-invited time-limited booth
  offers (auto-released if not accepted); notification system with
  editable templates, an Email/SMS/WhatsApp provider abstraction that
  logs to a dev console when no provider is configured (never fakes a
  send); a CSV export centre with column selection across 11 datasets;
  mobile-friendly setup-day checklist with a QR code per confirmed vendor.
- **Phase 6: Audit log UI, analytics, testing, security review** —
  platform-wide filterable/paginated audit log viewer; expanded admin
  dashboard (event capacity %, expected/collected/pending revenue, booth
  status breakdown, category distribution, expiring holds, recent
  payments); 26 automated tests; a security review that found and fixed
  four real privilege-escalation-class RLS gaps (see below — read this
  before deploying).

The full database schema is created in `supabase/migrations/0001_init.sql`
through `0011_profiles_hardening.sql`, applied in order.

## ⚠️ Security review findings (fixed, but read this)

A deliberate Phase 6 pass through every RLS policy found that four tables
had **row-ownership-only** policies with no column restriction — meaning a
vendor calling the Supabase REST API directly (bypassing the app's Server
Actions entirely) could have written privileged columns on their own rows.
All four are fixed by moving those specific writes into narrow
`SECURITY DEFINER` SQL functions and removing the vendor's direct
INSERT/UPDATE grant (migrations `0008`–`0011`):

| Table | What a vendor could have done | Fix |
|---|---|---|
| `profiles` | Set their own `role` to `'admin'` — **full privilege escalation**, since every admin check in the app is `profiles.role = 'admin'` | Removed vendor self-update entirely; admin-only now |
| `payments` | Set their own `status` to `'paid'` directly, bypassing verification | `submit_adcb_payment_reference()` / `submit_bank_transfer_receipt()` — narrow, status-gated |
| `businesses` | Set their own `approval_status` to `'approved'`, skipping admin review | `update_business_profile()` / `submit_business_profile_for_review()` — profile fields only, never approval fields |
| `applications` | Set their own `status` to `'confirmed'` without payment | `apply_to_event()` |
| `waiting_list` | Set their own `priority` to jump the queue | `join_waiting_list()` |
| `audit_logs` | Insert a log entry with an arbitrary `actor_id`, spoofing another user | INSERT now requires `actor_id = auth.uid()` or null |

This is the same pattern already used for `booths` from Phase 3 (vendors
never had direct write access there) — Phase 6 brought the other
vendor-writable tables in line with it. If you're reviewing this codebase,
`supabase/migrations/0008_security_hardening.sql` through
`0011_profiles_hardening.sql` are the ones worth reading closely.

### Notes on other Phase 5/6 scope decisions

- **CSV, not .xlsx**: the only maintained Node library for writing real
  `.xlsx` files (`xlsx`/SheetJS) has an unpatched high-severity
  prototype-pollution advisory with no fix on npm. Exports are CSV
  instead — it opens natively in Excel and Google Sheets and avoids
  shipping a known-vulnerable dependency.
- **Time-based reminders not wired**: "payment deadline reminder",
  "event reminder", and "setup reminder" need a scheduler firing on a
  timer, not a user action. Vercel Cron's free tier only supports daily
  jobs, which isn't reliable enough for these, so they're intentionally
  not implemented rather than faked. Every other notification in the spec
  is triggered by a real action and is wired up.
- **Draft/closed events are readable by any authenticated vendor** (not
  just admins) — `events` RLS grants SELECT to all authenticated users so
  the vendor dashboard can show upcoming events. This is a minor
  information-disclosure tradeoff (a vendor could see a not-yet-open
  event's name/dates), not a data-integrity issue; tighten it with a
  `registration_status <> 'draft' or is_admin()` clause if that matters
  for your rollout.
- **Bank details are a single global record**, not per-event, since the
  spec describes one set of bank details shown to vendors. The schema
  supports per-event bank details (`bank_details.event_id`) if you need
  to override it for a specific event later.

## Why the homepage previously 404'd

The connected GitHub repository was empty — no commits, no `app/page.tsx`,
no Next.js project at all — so Vercel had nothing to build or serve. This
build adds the actual application, starting with a working `app/page.tsx`
and `app/layout.tsx`.

## Tech stack

- **Next.js 16** (App Router). Note: Next 16 renamed `middleware.ts` to
  `proxy.ts` — this project uses the new convention (`proxy.ts` at the
  repo root, exporting a `proxy()` function).
- **TypeScript**, strict mode.
- **Tailwind CSS v4** (CSS-based theme in `app/globals.css`, no
  `tailwind.config.ts` needed).
- **Supabase**: Auth (email/password, email verification, password
  reset), Postgres with Row Level Security, Storage (logos, trade
  licences, product photos, receipts, setup photos), Realtime (live booth
  status).
- **Zod** for all server-side validation, **React Hook Form** for forms.
- `qrcode` for setup-day check-in QR codes.
- Hand-authored types in `types/database.ts` mirroring the SQL schema
  exactly (see note in that file about regenerating with the Supabase CLI
  once a project is linked).

## Local setup

```bash
npm install
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
# SUPABASE_SERVICE_ROLE_KEY from your Supabase project (see below)
npm run dev
```

The app runs at http://localhost:3000. The marketing homepage renders even
without Supabase configured; sign-up, login, and dashboards require it.

### Running the test suite / checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Supabase setup

1. Create a free project at https://supabase.com.
2. In **Project Settings → API**, copy the Project URL, `anon` public key,
   and `service_role` key into `.env.local` (see `.env.example`).
3. Run the migrations against your project, in order, with the
   [Supabase CLI](https://supabase.com/docs/guides/cli):

   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   This applies every file in `supabase/migrations/` in order — full
   schema, storage buckets, all the `SECURITY DEFINER` functions, and the
   RLS hardening from Phase 6. Alternatively, paste each migration file's
   contents into the Supabase dashboard's SQL Editor and run them in
   order (0001 → 0011).

4. Seed reference data (business categories, notification templates —
   no personal data, safe for any environment):

   ```bash
   # via CLI
   supabase db execute -f supabase/seed.sql
   # or paste supabase/seed.sql into the SQL Editor
   ```

5. **Enable email confirmations**: Authentication → Providers → Email →
   "Confirm email" should be ON (default) so the sign-up flow's email
   verification step actually applies.

6. **Enable Realtime** on `public.booths` if you didn't run migrations via
   `supabase db push` (that migration does it automatically) — otherwise
   the live floor-plan updates won't propagate between vendors.

7. **Regenerate TypeScript types** against your linked project (optional
   but recommended once you've confirmed the schema matches):

   ```bash
   supabase gen types typescript --linked > types/database.ts
   ```

### Demo accounts (local development only)

`scripts/seed-demo-accounts.ts` creates two admin accounts (Saeed, Omar)
and one pre-approved demo vendor, using the service role key. It refuses to
run if `NODE_ENV`/`VERCEL_ENV` is `production`.

```bash
npm run seed:demo
```

This prints the accounts and a shared demo password
(`DarAlHay#2025`). **Never reuse this password for a real account** —
rotate/delete these users before going to production.

## Production redirect URLs (required before going live)

Supabase's email links (verification, password reset) redirect back to
your app. In the Supabase dashboard, go to **Authentication → URL
Configuration** and set:

- **Site URL**: your production URL, e.g. `https://your-app.vercel.app`
- **Redirect URLs**: add `https://your-app.vercel.app/auth/callback`
  (and the same for any preview/staging domains you use, plus
  `http://localhost:3000/auth/callback` for local dev)

Also set `NEXT_PUBLIC_SITE_URL` in your Vercel project's environment
variables to the same production URL — it's used to build the
`emailRedirectTo` / `redirectTo` links sent in confirmation and
reset-password emails, and the setup-day QR codes.

## Vercel deployment

1. Import this repository into Vercel (Next.js is auto-detected).
2. Add environment variables in **Project Settings → Environment
   Variables**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` at minimum. Add the
   email/SMS/WhatsApp/ADCB variables from `.env.example` once you have
   real provider credentials — every notification channel degrades to a
   logged "queued" state without them, nothing breaks.
3. Deploy. The homepage (`/`) renders regardless of Supabase configuration;
   `/signup`, `/login`, `/vendor/*`, `/admin/*` require the Supabase
   variables above to be set.
4. Do not commit `.env.local` or any secret — only `.env.example` (with
   placeholder values) is checked into git.
5. After deploying, run `npm run seed:demo` **against your local machine
   pointed at the production Supabase project** only if you want demo
   accounts there (not recommended for real production — see the warning
   above), or use the admin console once you've manually promoted a real
   user's `profiles.role` to `'admin'` in the Supabase SQL editor.

## Project structure

```
app/
  page.tsx, layout.tsx        marketing homepage + root layout
  (auth)/                     login, signup, forgot/reset password
  auth/actions.ts             sign up / log in / log out / password reset server actions
  auth/callback/route.ts      Supabase email link handler (verification + recovery)
  vendor/                     dashboard, profile, booth selection, payment, waiting list (protected)
  admin/                      dashboard, vendors, events, booths, payments, waiting list,
                               setup check-in, notifications, export centre, audit log,
                               bank details (protected)
proxy.ts                      Next 16 "proxy" (formerly middleware) — session refresh + optimistic route guards
lib/
  supabase/                   browser / server / admin Supabase clients + proxy session helper
  dal.ts                      Data Access Layer — the real (DB-backed) auth checks
  audit.ts                    audit_logs writer
  storage.ts                  Supabase Storage upload/signed-URL helpers
  notifications.ts            template rendering + Email/SMS/WhatsApp dispatch
  recommendations.ts          rule-based booth recommendation engine
  export.ts, export-datasets.ts  CSV export centre
  qr.ts                       setup-day QR code generation
  validations/                Zod schemas
  constants.ts, format.ts     status labels, AED/UAE-phone formatting
components/
  ui/                         small design system (Button, Input, Card, Toast, Dialog, ...)
  forms/                      react-hook-form components wired to server actions
  layout/                     dashboard shell (sidebar + mobile drawer)
  marketing/                  homepage navbar/footer
  vendor/, admin/             feature-specific client components (floor plan, booth editor, etc.)
supabase/
  migrations/0001-0007        full platform schema, storage, booth/payment/waiting-list functions
  migrations/0008-0011        Phase 6 security hardening (see findings table above)
  seed.sql                    categories + notification template reference data
scripts/seed-demo-accounts.ts local-dev-only demo admin/vendor accounts
types/database.ts             hand-authored Supabase types (see file header)
tests/                        Vitest unit tests (formatting, validation, recommendations, CSV export)
```

## Security notes

- Every table has Row Level Security enabled. Vendors can only **read**
  their own business/application/payment/waiting-list rows directly;
  every **write** to a privileged field (approval status, payment status,
  booth locks, waiting-list priority) goes through a narrow
  `SECURITY DEFINER` SQL function that re-validates ownership and state
  server-side — see the findings table above for why this matters more
  than it might look.
- The `service_role` key is only used in `lib/supabase/admin.ts`
  (server-only) for operations that must run before a user has a session
  (e.g. uploading signup files) — never imported into a Client Component.
- `proxy.ts` does *optimistic* cookie-based redirects only. Every
  protected Server Component/Action also calls `requireVendor()` /
  `requireAdmin()` from `lib/dal.ts`, which re-checks the real `profiles`
  role from the database — the recommended Next.js pattern, since proxy
  alone is not sufficient defense.
- CSV exports escape formula-injection characters (`=`, `+`, `-`, `@` at
  the start of a cell) so a malicious business name can't execute code
  when an admin opens the export in Excel.
- No secrets are committed; `.env.local` is gitignored.

## Known limitations

- Time-based reminders (payment deadline, event, setup) aren't wired —
  see the scope-decisions note above.
- No true `.xlsx` export — CSV only, for the security reason above.
- Single global bank-details record rather than per-event (schema
  supports per-event; UI doesn't yet).
- Booth adjacency for "avoid similar businesses nearby" recommendations
  uses simple centre-to-centre distance on the floor plan, not aisle/path
  distance — fine for typical layouts, may need tuning for unusual ones.
