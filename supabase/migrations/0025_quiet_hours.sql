-- ===== Quiet hours for email notifications (deferred Phase E item) =====
-- Storage only -- no new RPC needed, since profiles_update (0001_core.sql)
-- already lets a user update any column on their own row, the same policy
-- sticker_mode/is_public rely on. The actual quiet-hours check happens
-- app-side in lib/quiet-hours.ts at send time, not in Postgres: these are
-- immediate, synchronous sends from server actions (not cron-driven), so
-- there's no scheduler in the database that would need this logic.
--
-- timezone is an IANA zone name (e.g. "America/Chicago"), validated
-- app-side against Intl.supportedValuesOf("timeZone") rather than via a
-- CHECK constraint -- Postgres CHECK constraints can't subquery
-- pg_timezone_names. A null timezone means "not set", which the app
-- treats as quiet hours being inactive regardless of quiet_hours_enabled,
-- since a start/end hour is meaningless without knowing whose midnight it is.
alter table public.profiles
  add column timezone text,
  add column quiet_hours_enabled boolean not null default false,
  add column quiet_hours_start smallint not null default 21 check (quiet_hours_start between 0 and 23),
  add column quiet_hours_end smallint not null default 8 check (quiet_hours_end between 0 and 23);
