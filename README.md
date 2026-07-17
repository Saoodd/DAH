# Dar Al Hay Events — Vendor Management Platform

A production platform for Dar Al Hay Events (Dubai) to run the full vendor
lifecycle for curated pop-up events: account creation, business approval,
event registration, interactive booth selection, payments, and vendor
communication.

Built with Next.js (App Router) + TypeScript + Tailwind CSS + Supabase
(Auth, Postgres, Storage, Row Level Security).

## Project status

This is being built in phases. See the commit history for what's shipped.

- **Phase 1 (this build): Foundation** — deployment fix, authentication,
  permanent business profiles, vendor/admin roles, full database schema for
  the whole platform (events, booths, locks, applications, payments,
  waiting list, notifications, audit log, setup checklist), and a basic
  vendor/admin dashboard shell.
- **Phase 2 (next): Approval workflow, events, applications**
- **Phase 3: Interactive booth map, 5-minute locking, recommendations**
- **Phase 4: Payments (ADCB Pace Pay + IBAN), expiry**
- **Phase 5: Waiting list, notifications, export centre, setup check-in**
- **Phase 6: Audit log UI, analytics, testing, security review**

The database schema for the entire platform (all phases) is created in
`supabase/migrations/0001_init.sql` and `0002_storage.sql` up front, so
later phases add application code rather than risky incremental schema
changes.

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
  licences, product photos, receipts), Realtime (used from Phase 3
  onward for live booth status).
- **Zod** for all server-side validation, **React Hook Form** for forms.
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
3. Run the migrations against your project. Easiest path with the
   [Supabase CLI](https://supabase.com/docs/guides/cli):

   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   This applies `supabase/migrations/0001_init.sql` (full schema + RLS
   policies) and `0002_storage.sql` (storage buckets + storage policies).

   Alternatively, paste each migration file's contents into the Supabase
   dashboard's SQL Editor and run them in order.

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

6. **Regenerate TypeScript types** against your linked project (optional
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
reset-password emails.

## Vercel deployment

1. Import this repository into Vercel (Next.js is auto-detected).
2. Add environment variables in **Project Settings → Environment
   Variables**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` at minimum. Add the
   email/SMS/WhatsApp/ADCB variables from `.env.example` once those
   providers are wired up in Phase 4/5.
3. Deploy. The homepage (`/`) renders regardless of Supabase configuration;
   `/signup`, `/login`, `/vendor/*`, `/admin/*` require the Supabase
   variables above to be set.
4. Do not commit `.env.local` or any secret — only `.env.example` (with
   placeholder values) is checked into git.

## Project structure

```
app/
  page.tsx, layout.tsx        marketing homepage + root layout
  (auth)/                     login, signup, forgot/reset password
  auth/actions.ts             sign up / log in / log out / password reset server actions
  auth/callback/route.ts      Supabase email link handler (verification + recovery)
  vendor/                     vendor dashboard + business profile (protected)
  admin/                      admin dashboard + vendor list/detail (protected)
proxy.ts                      Next 16 "proxy" (formerly middleware) — session refresh + optimistic route guards
lib/
  supabase/                   browser / server / admin Supabase clients + proxy session helper
  dal.ts                      Data Access Layer — the real (DB-backed) auth checks
  audit.ts                    audit_logs writer
  storage.ts                  Supabase Storage upload/signed-URL helpers
  validations/                Zod schemas
  constants.ts, format.ts     status labels, AED/UAE-phone formatting
components/
  ui/                         small design system (Button, Input, Card, Toast, ...)
  forms/                      react-hook-form components wired to server actions
  layout/                     dashboard shell (sidebar + mobile drawer)
  marketing/                  homepage navbar/footer
supabase/
  migrations/0001_init.sql    full platform schema + RLS (all phases)
  migrations/0002_storage.sql storage buckets + storage RLS
  seed.sql                    categories + notification template reference data
scripts/seed-demo-accounts.ts local-dev-only demo admin/vendor accounts
types/database.ts             hand-authored Supabase types (see file header)
tests/                        Vitest unit tests (formatting, validation)
```

## Security notes

- Every table has Row Level Security enabled; vendors can only read/write
  their own business, application, payment, and waiting-list rows —
  enforced in Postgres, not just in the UI.
- The `service_role` key is only used in `lib/supabase/admin.ts`
  (server-only) for operations that must run before a user has a session
  (e.g. uploading signup files) or admin-only cross-vendor operations —
  never imported into a Client Component.
- `proxy.ts` does *optimistic* cookie-based redirects only. Every
  protected Server Component/Action also calls `requireVendor()` /
  `requireAdmin()` from `lib/dal.ts`, which re-checks the real `profiles`
  role from the database — the recommended Next.js pattern, since proxy
  alone is not sufficient defense.
- No secrets are committed; `.env.local` is gitignored.

## Known gaps / what's next

Everything described in phases 2-6 (approval actions, events, live booth
map, payments, waiting list, notification delivery, export centre,
setup-day check-in, full audit log UI) is scheduled but not yet built —
see "Project status" above. The database schema for all of it already
exists so those phases are additive.
