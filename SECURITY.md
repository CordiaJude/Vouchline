# Security review

This document is the Phase 8 security review: the threat model, the
mitigations already in place, a self-audit checklist standing in for the
Supabase security advisor (no live project is connected in the environment
this was written in — see the note under "Advisor" below), and one real
finding this review caught and fixed.

## Threat model and mitigations

### 1. Fake / forged connection edges

**Threat:** a user claims a relationship that doesn't exist, or inflates
years/closeness, to manufacture broker paths or pad their network.

**Mitigation:** every edge requires *independent, blind* answers from both
sides (`connections.lo_*` / `hi_*`), written through `redeem_connect_token`,
`answer_connection`, or `request_connection` — never a direct table write
(the `connections` and `connection_edges` tables have RLS enabled with **no
policies at all**, so even an authenticated user has zero direct
INSERT/UPDATE/SELECT access; every read and write goes through a
SECURITY DEFINER RPC). The effective type is only set when both sides'
answers match (`private.recompute_connection`); years and strength are
always `least()` of the two answers, so neither side can unilaterally
inflate the relationship. QR tokens expire in 10 minutes and are
single-use-per-answerer; a same-org check and a 30-connections/24h limit
bound how fast one account can mint edges.

### 2. Strength leak

**Threat:** a user's private closeness rating (1–3) leaks to the other
party, to a broker, or to anyone besides the person who entered it.

**Mitigation:** `eff_strength` is computed and stored, but no RPC's
`RETURNS TABLE` signature ever includes `eff_strength`, `lo_strength`, or
`hi_strength` — `my_connections()` returns only the caller's own
`my_strength`, and `find_brokers()` uses `eff_strength` internally purely to
order results, never in its output columns. This is structural (baked into
each function's return type at `CREATE FUNCTION` time), not a runtime
filter, so there's no code path that could accidentally start returning it.
`supabase/tests/security.test.sql` enforces this with a structural
`information_schema.parameters` query asserting **zero** public functions
have an OUT parameter named `eff_strength`/`lo_strength`/`hi_strength` —
this fails the build if anyone ever adds one.

### 3. Spam intro requests

**Threat:** a user floods brokers or targets with unwanted introduction
requests.

**Mitigation:** `request_intro` enforces four independent limits: max 3
simultaneously open requests per requester, max 5 created per requester per
7 days, no repeat request to the same target within 30 days, and max 5
pending inbound requests per broker. All four are tested in
`supabase/tests/intros.test.sql`. Every limit is a guess at reasonable MVP
numbers (per the project's own "tune after week 1" note) — they're easy to
adjust in `0006_intros.sql` once real usage data exists.

### 4. Roster scraping

**Threat:** a member enumerates the org's full roster (names, employers,
cities, grad years) beyond what search/broker-finding legitimately needs.

**Mitigation:** `search_members` is rate-limited to 60 calls/minute per
user (Phase 8), returns at most 20 rows per call, and is scoped to the
caller's own orgs (`private.my_org_ids()`) — never a full unfiltered list.
`suggest_from_roster()` is capped at 20 rows and requires a pledge-class or
±1-grad-year match, not an open browse. `admin_list_members` (the one RPC
that *does* return a full roster with emails) is gated on
`private.is_org_admin()` and raises `not_authorized` otherwise. None of
this stops a determined admin from scraping their own org's roster — that's
inherent to the admin role and out of scope for this review.

### 5. Anonymous access to RPCs (found and fixed this phase)

**What happened:** every migration through Phase 7 wrote
`revoke all on function X from public;` believing that closed off
unauthenticated access. It didn't. Supabase's platform applies
`alter default privileges in schema public grant execute on functions to
anon, authenticated, service_role` — so every function picked up its own
**direct** grant to the named `anon` role at `CREATE FUNCTION` time.
Revoking from the `PUBLIC` pseudo-role only removes what `PUBLIC` itself
was granted; it does not touch a separate grant already held by a named
role. Every RPC in this project — including `delete_my_account`,
`redeem_connect_token`, `request_intro`, and every `admin_*` function —
was therefore callable by anonymous, unauthenticated clients the entire
time.

**Fix:** `0008_security.sql`'s "grant audit fix" section explicitly
re-issues `revoke all ... from public, anon, authenticated` followed by a
narrow `grant execute ... to authenticated` (or `service_role` for the two
functions that should only ever be called from trusted server code) for
every single RPC in the project. `security.test.sql` now asserts
`has_function_privilege('anon', ..., 'execute')` is false for every one of
them, so this can't silently regress. **Every future migration that adds a
public RPC must revoke from `anon` by name, not just `public`.**

### 6. Blocking doesn't stop future contact

**Threat:** a blocked user can still request an intro, connect via QR, or
show up in search results to the person who blocked them.

**Mitigation:** `private.is_blocked_between()` is checked in
`redeem_connect_token`, `request_connection`, `find_brokers`,
`search_members`, `suggest_from_roster`, `request_intro`, and (Phase 8)
`pending_for_me`. Blocking is self-service (`blocks` table, RLS-scoped to
`blocker_id = auth.uid()`) with a block/unblock UI on profile pages and a
managed list in Settings. Existing confirmed connections are **not**
retroactively hidden by a block — blocking stops future interaction, it
doesn't rewrite history; a report is the mechanism for asking an admin to
act on a specific incident.

### 7. Account takeover via magic-link interception

**Threat:** a stolen or forwarded magic-link email lets someone else sign
in as the victim.

**Mitigation:** links expire per Supabase Auth's own OTP TTL and are
single-use. Login itself is now rate-limited (Phase 8, 5 requests per email
per 10 minutes) to blunt email-flooding/harassment via repeated magic-link
sends, independent of whether any individual link is compromised. Full
session-hijacking mitigations (device binding, IP anomaly detection) are
out of scope for an MVP pilot.

### 8. Service-role key exposure

**Threat:** the Supabase service-role key (which bypasses all RLS) ends up
in client-side JavaScript.

**Mitigation:** the key is read only in `lib/supabase/admin.ts`, which
starts with `import "server-only"` (a build-time guard that throws if the
module is ever imported into a client bundle). Grepping `app/` and `lib/`
for `SUPABASE_SERVICE_ROLE_KEY` finds exactly one match — that file.
Grepping every `"use client"` file for `createAdminClient` or
`supabase/admin` finds zero matches.

## Self-audit checklist (advisor stand-in)

**No live Supabase project is connected in the environment this was
written in** (see the environment's own network policy — this sandbox
cannot reach `*.supabase.co`), so the real Supabase security advisor
(`get_advisors`) could not be run. Everything below is a manual audit
against every migration, cross-checked against a local Postgres instance
running the actual migration files. Whoever links the real project should
run the advisor for real and fold any new finding in here.

- [x] **RLS enabled on every `public` table.** Verified after every
  migration all session: `select tablename from pg_tables where
  schemaname='public' and not rowsecurity` returns 0 rows.
- [x] **Policies exist only where direct access is intended, and are
  scoped `to authenticated`.** `connections`, `connection_edges`, and
  `intro_requests` have RLS enabled with **zero** policies — this is
  intentional (RPC-only access) and is exactly the kind of thing a generic
  linter flags as "RLS enabled, no policy" without context. That finding,
  if the advisor raises it for these three tables, is expected and
  justified; it would be a real problem for any other table.
- [x] **Every SECURITY DEFINER function has `set search_path = ''`.**
  Verified by grep across all 8 migrations — every `create function`
  matches this.
- [x] **`anon` cannot execute any application RPC.** See finding #5 above.
  Verified structurally in `security.test.sql`.
- [x] **No client code imports the service-role key.** See mitigation #8.
- [x] **CSP and security headers set.** `next.config.ts` sets
  `Content-Security-Policy` (`default-src 'self'`, no wildcard script
  sources), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a
  `Permissions-Policy` disabling camera/microphone/geolocation (unused by
  this app). Verified the CSP doesn't break any client-side interaction by
  running the full Playwright suite against a production build with the
  headers live.
- [x] **Output escaping.** React/JSX escapes all rendered text by default;
  this codebase never uses `dangerouslySetInnerHTML`, so no user-supplied
  string (full name, ask text, report reason, CSV-imported name, ...) can
  inject markup.
- [x] **Input limits.** Every user-facing text field has both a DB `CHECK`
  constraint (e.g. `ask` 20–1200 chars, `full_name` 2–80, `reason` 5–1000)
  and a matching client-side limit; the CSV importer processes rows from a
  single uploaded file with no unbounded fan-out.
- [x] **Rate limiting on every write/search RPC.** All go through
  `private.check_rate_limit`, a shared Postgres counter table
  (`private.rate_limit_hits`): login 5 per email per 10 minutes
  (server-action-gated, since login is unauthenticated by definition), AI
  draft 1 per 10 seconds + 30/day per user, search/discover/company_members
  60/min per user, `find_brokers` 60/min per user (Phase 13),
  `add_target`/`add_target_stub` 60/hour per user, shared bucket (Phase
  13), `claim_person`/`claim_stub` 30/day per user. `request_intro` uses
  its own counting-based caps (3 open, 5/week, 5 in a broker's inbox)
  instead, since those are behavioral limits, not abuse throttles; the
  three `respond_intro_*`/notification-read RPCs are naturally
  self-limiting or scoped to the caller's own rows. All are tested in
  `security.test.sql`, `find_brokers.test.sql`, and `target_list.test.sql`.
- [ ] **Real Supabase advisor run.** Not possible from this environment —
  do this once the project is linked, before the pilot launches.

## Known gaps (accepted for the pilot, not fixed here)

- No IP-based rate limiting anywhere (only per-email or per-user), since
  this environment has no way to reliably attribute a real client IP
  through Vercel's edge network without further setup. A single user could
  still burn through the login rate limit across many email addresses if
  they controlled a mailbox with wildcard aliasing. Low risk for a
  50–100-person single-chapter pilot.
- `check_and_log_login_attempt` is keyed by the literal submitted email
  string (post-lowercase), not by account existence — this is deliberate
  (looking up whether an email has an account first would itself be a
  user-enumeration oracle), but it means the rate limit applies equally to
  typos and real attempts.
- Blocked users are excluded from future search/broker/pending results but
  a block does not retroactively hide or dissolve an already-confirmed
  connection. This is a design choice (mitigation #6), not an oversight,
  but worth restating here since it's the kind of thing a user might
  expect blocking to do.
