# Deployment

Phase 10 (production launch) checklist and reference. This documents how to
deploy this app for real; it doesn't confirm you've done every step, since I
(the agent that wrote this) don't have access to your actual production
Supabase or Vercel projects -- you've been running migrations by hand
against your own Supabase project throughout this build, and creating the
Vercel project yourself.

## Supabase production project

1. Create (or confirm) a dedicated production Supabase project -- don't
   reuse a dev/staging project for the pilot.
2. Apply every file in `supabase/migrations/` in order (currently `0001`
   through `0021` -- check the directory for the real current top number,
   since this doc won't stay in sync with every new migration), via the SQL
   editor or `supabase db push`. Verify afterward:
   ```sql
   select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
   -- should return 0 rows
   ```
3. Run `supabase/seed.sql` only if you want seed data in a non-production
   project. **Do not run it against production** -- it creates fake orgs
   and users.
4. Onboarding does **not** require an invite. Per the product spec (revised
   after this doc was first written for an earlier spec revision that did
   gate onboarding on an org invite), there is no org-membership gate on who
   can use the app at all -- `/signup` is open self-signup with email +
   password + name, and org membership (via an invite link) is optional,
   only needed for org rosters/admin/metrics. Don't rely on an invite
   requirement as a launch control; if you need to limit the pilot to a
   specific roster, that's enforced by who you actually hand invite links to
   and by what you tell people at the launch meeting (see
   `PILOT_CHECKLIST.md`), not by the app blocking signups.
5. Run the Supabase security advisor (`get_advisors`, or Database → Advisors
   in the dashboard) once your real schema is live. `SECURITY.md`'s
   self-audit checklist has an unchecked box for exactly this -- check it
   off once you've run it for real and folded in anything it finds.

## Custom email domain (SPF/DKIM)

Resend requires a verified sending domain for production (the
`onboarding@resend.dev` fallback in `.env.example` is dev-only and will get
flagged as spam or rate-limited).

1. In Resend, add your sending domain (e.g. `mail.yourchapter.org`).
2. Add the SPF, DKIM, and (recommended) DMARC DNS records Resend gives you
   to your domain's DNS.
3. Wait for verification (usually minutes, can take longer depending on
   your DNS provider's propagation).
4. Set `EMAIL_FROM` in production to an address on the verified domain, e.g.
   `Vouchline <notify@mail.yourchapter.org>`.
5. Send a real test email to a Gmail address and an Outlook address and
   confirm it lands in the inbox, not spam, before inviting real members.
   **This hasn't been done yet** -- see the Untested section below.

## Vercel production environment

Set these as production environment variables in the Vercel project
(`.env.example` has the full list with comments):

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your production Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production service-role key. **Never** expose this to the client -- only read in `lib/supabase/admin.ts` |
| `RESEND_API_KEY` | From your verified Resend account |
| `EMAIL_FROM` | Must be on the verified domain, see above |
| `APP_URL` | Your production custom domain, e.g. `https://app.yourchapter.org` |
| `ANTHROPIC_API_KEY` | For the AI draft feature |
| `CRON_SECRET` | Random secret; must match what Vercel Cron sends as the `Authorization: Bearer` header on the three `/api/cron/*` routes |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | From your Sentry project (see below). Leave both blank to run with no error monitoring |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Optional, only needed for source-map upload at build time |

Add your custom domain in the Vercel project's Domains settings and point
its DNS at Vercel per their instructions.

**Cron schedule limit on the Hobby plan.** Vercel's Hobby plan only allows
cron jobs to run once per day; `vercel.json`'s three cron entries are
currently `0 3 * * *`, `0 14 * * 1`, and `0 15 * * *` for exactly this
reason. If a deploy silently stops appearing (no error in the UI, no new
deployment record, nothing in `list_deployments`), check whether
`vercel.json` was changed to a sub-daily schedule -- Vercel rejects the
whole deployment at validation time before a deployment record even exists,
which looks identical to "the webhook isn't firing" from the outside. This
actually happened once during this build. If you need the original
15-minute/hourly cadence (faster intro-expiry and follow-up turnaround),
upgrade to the Pro plan first.

## Sentry (free tier)

1. Create a free Sentry account and a Next.js project.
2. Copy its DSN into both `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN`
   (browser) -- they're the same value, just exposed differently.
3. `instrumentation.ts` and `instrumentation-client.ts` both no-op if their
   DSN env var is unset, so nothing breaks if you skip this, but you'll
   have no error visibility in production.
4. Optional: set `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` to
   upload source maps at build time for readable stack traces.

## Backups and restore

Supabase's backup behavior depends on your project's plan:

- **Free plan:** no automatic backups beyond what you export yourself. If
  the pilot is running on a free-tier project, export a `pg_dump` manually
  before anything risky (a migration, a bulk data operation) and consider
  upgrading before real member data is on it.
- **Pro plan and above:** daily backups are included, retained per your
  plan's retention window. Point-in-time recovery (PITR) is an optional
  paid add-on with per-minute granularity.

**Confirm your actual settings** in Database → Backups in the Supabase
dashboard -- this doc can't verify them, since it wasn't written against
your real production project.

### Restore procedure

1. **Daily backup restore:** Database → Backups in the dashboard, pick a
   backup, and restore. This is destructive to the current database state
   -- Supabase will warn you. Prefer restoring into a new project/branch
   first to verify the backup is what you expect before restoring in place.
2. **PITR (if enabled):** Database → Backups → Point in Time Recovery, pick
   a timestamp. Same caution as above.
3. **Manual `pg_dump` restore:** `psql <connection-string> < backup.sql` (or
   `pg_restore` for a custom-format dump) against a fresh project, then
   re-point `NEXT_PUBLIC_SUPABASE_URL` once verified.

After any restore, re-run the RLS check in step 2 of "Supabase production
project" above -- a restore replays the schema as of that snapshot, which
could predate a security fix if you restore far enough back.

## Untested

Per this repo's own standing rule (`AGENTS.md`/session convention): don't
claim something works until it's been run for real. As of this write-up,
none of the following have actually been done:

- Applying migrations to a real production Supabase project (you've done
  this by hand throughout the build, but there's no automated record of
  which migrations are live where).
- Verifying SPF/DKIM on a real custom sending domain.
- Sending a real test email and confirming Gmail/Outlook inbox placement.
- Creating the Vercel production project and setting the env vars above.
- Confirming actual backup/PITR settings on the real project.
- Running the Supabase security/performance advisors against the real
  schema.
- The full Playwright suite against a real production preview URL (this
  sandbox has only ever run it against `localhost` with the unauthenticated
  guard subset -- the live-Supabase-gated tests have never run here).
