# DAH Repair Summary

Release prepared on 28 July 2026 for the Dar Al Hay Events vendor-management platform. The repair preserves the existing Next.js and Supabase architecture and does not change the upstream repository, create a commit, or publish a deployment.

## Platform and runtime

- Frontend and server: Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS 4
- Data platform: Supabase Auth, Postgres, Storage, Row Level Security, and Realtime
- Forms: React Hook Form and Zod
- Tests: Vitest, ESLint, and the TypeScript compiler
- Package manager: npm with the committed `package-lock.json`
- Runtime: Node.js 20.9 or newer and npm 10 or newer; `.nvmrc` selects Node 20

## Original problems identified

- The committed lockfile did not match the package manifest, so a clean `npm ci` failed.
- Environment and database setup were incomplete and several production assumptions were undocumented.
- Public and authentication pages could fail abruptly when Supabase configuration was absent.
- Authentication redirects were not consistently constrained to local paths, provider failures were not always surfaced correctly, and partial signup failures could leave an orphaned auth user.
- Several high-risk payment and booth operations used multiple independent writes, which left race and partial-update windows.
- Vendor registration visibility, application history, payment access, waiting-list booth selection, and expiry refresh behavior could become stale or disappear at the wrong time.
- Administrative lists and exports could silently stop at service pagination limits. CSV exports were not neutralized against spreadsheet-formula injection.
- Database policies, mutation privileges, state transitions, storage ownership, file-size enforcement, and several cross-table integrity conditions needed hardening.
- Replacement uploads could leave superseded event banners, vendor documents, setup photos, and payment receipts in storage.
- Notification broadcasting lacked complete audience pagination and bounded delivery behavior.
- Several forms and controls had weak labels, focus treatment, dialog keyboard behavior, confirmation feedback, loading/error states, mobile navigation, or responsive table behavior.
- Starter assets, inconsistent visual treatments, and sparse page hierarchy made the interface feel unfinished.

## Functional and technical repairs

- Synchronized `package-lock.json` with the manifest without introducing a broad dependency upgrade.
- Added strict environment parsing, origin normalization, production-only configuration checks, and a safe public-site fallback when operational credentials are absent.
- Hardened login, signup, password reset, and callback handling with local-only redirects, generic provider error treatment, fixed vendor-role signup, and compensating cleanup for incomplete account creation.
- Added migration `0012_security_and_integrity_hardening.sql` with stricter RLS, grants, storage rules, constraints, and transactional database functions.
- Moved every payment mutation and administrative booth assignment/release operation into role-checked, event-scoped, row-locked database functions. The functions reject stale state and invalid amounts instead of presenting a false success.
- Corrected vendor access rules so effective registration windows are respected while existing applications and payment history remain visible after registration closes.
- Resynchronized waiting-list booth choices against current availability and refreshed expired invitations, holds, and payment requests at the relevant operational boundaries.
- Added pagination and explicit query-error handling to administrative vendors, applications, events, payments, setup, audit, and dashboard views.
- Made exports collect complete paginated datasets up to a documented 100,000-row safety limit, disable caching, record audit activity, and neutralize spreadsheet formulas.
- Added bounded broadcast delivery, complete audience pagination, a 200-recipient direct-send cap, and honest queued status when a provider is not configured.
- Added strict server-side validation for events, booths, recommendations, bank details, uploads, and high-risk mutations.
- Added safe best-effort cleanup for superseded event banners, vendor logos and licences, setup photos, and payment receipts while retaining shared or unrecognized objects.
- Guarded demo seeding against production and require an exact project-reference confirmation for non-local projects.
- Added production browser security headers, explicit Supabase image/origin configuration, a custom error boundary, and a dedicated account-error route.
- Removed unused starter SVG assets and added an application icon.

## Design and usability improvements

- Established consistent color, typography, spacing, radius, shadow, control-height, focus, and status-treatment tokens.
- Reworked the public landing page hierarchy and navigation while preserving Dar Al Hay branding and business purpose.
- Refined dashboard navigation, cards, forms, buttons, tables, pagination, alerts, confirmations, empty states, loading states, and error messages.
- Improved mobile navigation and made dense administrative views usable on mobile, tablet, laptop, and large desktop widths.
- Kept active vendor applications visible and made status, next action, event details, instructions, and payment access clearer.

## Accessibility improvements

- Added or corrected programmatic form labels, descriptions, field errors, image alternative text, and semantic headings.
- Added visible keyboard focus states and converted clickable behavior to native interactive controls where appropriate.
- Added dialog labelling, Escape-to-close behavior, focus trapping, focus restoration, and background-scroll locking.
- Improved status and validation messaging so meaning does not depend only on color.
- Verified the reviewed public and authentication pages had one primary heading, no missing image alternatives, no unnamed buttons, no unlabeled inputs, and no duplicate IDs.

## Verification performed

All checks below were run against the repaired source on 28 July 2026:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

- Clean dependency installation: passed; 556 packages installed from the lockfile.
- ESLint: passed.
- TypeScript type-check: passed without emitted files.
- Vitest: 47 of 47 tests passed across 7 test files.
- Optimized Next.js production build: passed; all static and dynamic routes compiled.
- Development server: started successfully.
- Production server: started successfully from the completed build.
- Production browser console: 0 errors and 0 warnings during the reviewed routes.
- Responsive browser review: passed at 375 x 812, 768 x 1024, 1024 x 768, and 1440 x 900 with no horizontal overflow on the reviewed pages.
- Route review: homepage, login, signup, forgot-password, reset-password, admin/vendor protection, account-error, auth callback, and custom 404 behavior were checked.
- HTTP review: expected status codes and redirects were returned; production responses included CSP, HSTS, referrer, MIME-sniffing, frame, and permissions headers.
- Production dependency audit: `npm audit --omit=dev` reported 0 vulnerabilities.
- Full dependency audit: 9 high findings remain in development-only ESLint/minimatch tooling. The automatic remedy requires a breaking ESLint major upgrade, so it was not forced into this release.
- SQL syntax review: all 99 statements in the hardening migration and all 235 statements across the database security-test blocks parsed successfully with PostgreSQL grammar.
- Diff whitespace check: passed.

## Exact installation and run instructions

1. Install Node.js 20.9 or newer and npm 10 or newer.
2. From the project root, install exactly from the lockfile:

   ```bash
   npm ci
   ```

3. Copy `.env.example` to `.env.local` and replace only the documented placeholders.
4. Apply every SQL file in `supabase/migrations` in lexical order, from `0001_init.sql` through `0012_security_and_integrity_hardening.sql`.
5. Run `supabase/seed.sql` once to add idempotent reference data.
6. Configure the Supabase authentication URLs and promote the first administrator as documented in `README.md`.
7. Start development:

   ```bash
   npm run dev
   ```

8. Build and serve production:

   ```bash
   npm run build
   npm run start
   ```

## Required environment variables

| Variable | Requirement |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Required for authentication and every data-backed workflow |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required for authentication and every data-backed workflow |
| `SUPABASE_SERVICE_ROLE_KEY` | Required server-side for complete signup, trusted audit, notifications, and cleanup |
| `NEXT_PUBLIC_SITE_URL` | Required in production for canonical authentication links and QR codes |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional email provider pair |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM` | Optional SMS provider set |
| `WHATSAPP_PROVIDER_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_GRAPH_API_VERSION` | Optional WhatsApp provider set |
| `SEED_DEMO_CONFIRM_PROJECT_REF` | Required only when intentionally running the guarded demo seed against a non-local project |
| `ADCB_PACE_PAY_BASE_URL`, `ADCB_PACE_PAY_API_KEY` | Reserved; not consumed by the current code |

Do not expose the service-role key or provider credentials through a `NEXT_PUBLIC_` variable. No real credentials are included in the repaired source.

## External services and remaining limitations

- A real Supabase project is required for login, signup, role checks, CRUD, uploads, realtime booth availability, and database-backed flows. No Supabase credentials or local Postgres service were available during repair, so authenticated end-to-end flows and the staging SQL assertions were not executed against a live database.
- Before production deployment, apply the migrations to staging, inspect existing rows, run `supabase/SECURITY_TESTS.md`, and validate the migration's intentionally `NOT VALID` constraints.
- Email, SMS, and WhatsApp delivery require their respective provider accounts. Without credentials, notifications stay visibly queued; they are never marked as sent.
- The included WhatsApp transport sends free-form text. Proactive messages outside Meta's service window require approved templates and provider-side campaign setup.
- ADCB Pace Pay is represented through administrator-attached provider payment links; a direct merchant API integration is not implemented.
- Scheduled reminders require a durable background job and an external scheduler, neither of which exists in the upstream architecture.
- Direct broadcasts are intentionally capped at 200 recipients. Larger campaigns need a background campaign service with retries and provider-specific rate handling.
- The production Content Security Policy still permits inline scripts and styles needed by the current Next.js and styling setup. Moving to nonce-based CSP is a recommended future hardening step.
- The upstream repository contained no `LICENSE` or `NOTICE`; confirm redistribution rights with the owner before commercial distribution.

## Important implementation decisions

- The existing Next.js/Supabase architecture, schema history, lockfile, branding, and product scope were retained.
- Errors were fixed at their source; linting, type checking, tests, and security checks were not disabled.
- Missing integrations use explicit unavailable or queued states, not fake success messages.
- High-risk mutations are atomic at the database boundary, and server actions retain validation and user-facing error handling.
- Cleanup is deliberately best effort after successful persistence and refuses to remove shared, foreign, legacy, or unrecognized storage paths.
- No dependency major upgrade, source rewrite, remote mutation, commit, push, or pull request was performed.
