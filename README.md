# Dar Al Hay Events

A responsive vendor-management platform for Dar Al Hay pop-up events. Vendors can create a reusable business profile, apply to an open event, select a booth from a live floor plan, complete payment, join a waiting list, and follow setup-day requirements. Administrators manage vendor approvals, events, booth layouts, payments, notifications, exports, and audit history.

## Technology

- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS 4
- Supabase Auth, Postgres, Storage, Row Level Security, and Realtime
- React Hook Form and Zod for forms and server-side validation
- Vitest for unit tests and ESLint for static analysis
- npm with the committed `package-lock.json`

## Prerequisites

- Node.js 20.9 or newer (`.nvmrc` selects Node 20)
- npm 10 or newer
- A Supabase project for authentication, database, file storage, and live booth updates
- Optional notification-provider accounts: Resend, Twilio, and Meta WhatsApp

The public homepage can run without Supabase. Login, signup, dashboards, and all operational workflows require a configured Supabase project.

## Install and run

```bash
npm ci
```

Create a local environment file from the documented template:

```powershell
Copy-Item .env.example .env.local
```

On macOS or Linux:

```bash
cp .env.example .env.local
```

Fill in the required Supabase values, apply the database setup below, then start development:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Operational app | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Operational app | Browser-safe Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Complete operational app | Server-only key required by signup, trusted audit, notification, and cleanup operations |
| `NEXT_PUBLIC_SITE_URL` | Production | Canonical app origin used in authentication links and QR codes |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional pair | Email delivery |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM` | Optional set | SMS delivery |
| `WHATSAPP_PROVIDER_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_GRAPH_API_VERSION` | Optional set | WhatsApp delivery and the Meta Graph version currently supported by your app |
| `ADCB_PACE_PAY_BASE_URL`, `ADCB_PACE_PAY_API_KEY` | Not currently consumed | Reserved for a future direct merchant API integration |
| `SEED_DEMO_CONFIRM_PROJECT_REF` | Hosted demo seed only | Exact hosted Supabase project reference required by the demo-seed safety guard |

Do not prefix the service-role key or provider secrets with `NEXT_PUBLIC_`. Do not commit `.env.local` or any real credential.

When notification credentials are absent, messages are recorded as `queued`; the application does not pretend that they were sent.

## Supabase database setup

Apply every SQL migration in lexical order:

```text
supabase/migrations/0001_init.sql
...
supabase/migrations/0012_security_and_integrity_hardening.sql
```

For a hosted project, use the Supabase Dashboard SQL Editor or the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase init
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Run `supabase init` only if the project has not already been initialized for the CLI. Use a staging project first when applying migrations to an existing database.

After the migrations, execute `supabase/seed.sql` once in the SQL Editor. It inserts idempotent reference data: vendor categories and notification templates. It does not create users or personal data.

Migration `0012_security_and_integrity_hardening.sql` intentionally adds several constraints as `NOT VALID` so existing production rows are not scanned or blocked during deployment. Follow the audit and validation procedure in [`supabase/SECURITY_TESTS.md`](supabase/SECURITY_TESTS.md) on a disposable or staging project before validating those constraints.

### Authentication configuration

In Supabase Authentication > URL Configuration, set:

- Site URL: the value of `NEXT_PUBLIC_SITE_URL`
- Redirect URL: `https://YOUR_APP_DOMAIN/auth/callback`
- Local redirect URL: `http://localhost:3000/auth/callback`

Keep email confirmation enabled if vendors must verify ownership before using the platform.

### Create the first administrator

Public signup always creates a vendor role by design. Create and verify the intended administrator account, then promote that exact user from the Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users where lower(email) = lower('ADMIN_EMAIL_HERE')
);
```

Confirm that one row changed. Never use signup metadata to grant administrator access.

### Optional demo accounts

The demo seed creates two administrators and one approved vendor. It generates a new random password on every run and prints it once:

```bash
npm run seed:demo
```

It refuses environments explicitly marked as production. Local Supabase targets work without additional confirmation. Any non-local project additionally requires `SEED_DEMO_CONFIRM_PROJECT_REF` to match its exact project reference. This confirmation is not proof that a target is safe: never point the demo seed at a real production database.

## Commands

```bash
npm run dev        # development server
npm run build      # optimized production build
npm run start      # serve the completed production build
npm run lint       # ESLint
npm run typecheck  # TypeScript without emitting files
npm run test       # Vitest unit suite
npm run seed:demo  # guarded demo-user seed
```

Recommended pre-deployment check:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## External services and operational behavior

- Supabase is required for every authenticated and data-backed feature.
- Resend, Twilio, and Meta WhatsApp credentials are optional. Without them, notification history remains testable and deliveries stay queued.
- Direct broadcasts paginate their audience, send in bounded batches, and stop at 200 recipients. Larger campaigns require a durable background campaign service.
- The included WhatsApp transport sends free-form text. Proactive messages outside Meta&rsquo;s customer-service window require approved WhatsApp templates and provider-side campaign setup that are not included here.
- ADCB Pace Pay has no direct API integration in this source. Administrators attach a provider-issued payment link to an individual payment; bank transfer and receipt verification are fully represented in the platform.
- Expired booth holds, invitations, and untouched payment requests are swept when relevant operational pages load and through admin controls. Scheduled reminders require both a reminder job implementation and an external scheduler; neither is included.
- Realtime is used for booth availability. Migration `0004_realtime.sql` configures the required publication.

## Project structure

```text
app/                    Next.js routes, layouts, server actions, and route handlers
components/             Design-system, form, vendor, and admin components
lib/                    Data access, Supabase clients, validation, exports, and notifications
public/                 Public assets
scripts/                Guarded operational scripts
supabase/migrations/    Database schema, functions, policies, and hardening migrations
supabase/seed.sql       Idempotent reference-data seed
supabase/SECURITY_TESTS.md
                        Staging-only database security and integrity checks
tests/                  Vitest unit tests
types/database.ts       Application-side Supabase schema types
```

## Security notes

- Protected pages and server actions re-check authenticated roles through the data-access layer; proxy redirects are only an early routing convenience.
- High-risk payment and booth state transitions use database functions that revalidate roles, event scope, application state, deadlines, and concurrent changes.
- Signup metadata cannot assign administrator privileges.
- Audit writes and post-mutation notifications use a server-only trusted client.
- Uploads are checked by the application, Storage bucket limits, ownership paths, and hardened database functions.
- CSV exports neutralize spreadsheet formulas and buffer complete paginated result sets with a 100,000-row safety limit.
- Production responses include a Content Security Policy and standard browser security headers.

See [`REPAIR_SUMMARY.md`](REPAIR_SUMMARY.md) for the repair scope, verification evidence, and remaining deployment limitations.

## License

The upstream repository did not contain a `LICENSE` or `NOTICE` file. No license or attribution file was removed or replaced. Confirm usage and distribution rights with the repository owner before commercial redistribution.
