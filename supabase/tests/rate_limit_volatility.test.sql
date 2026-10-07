create extension if not exists pgtap with schema extensions;

begin;
select plan(1);

-- Regression guard for 0040: a STABLE/IMMUTABLE function runs in a
-- read-only transaction under PostgREST, so if it calls the rate limiter
-- (which INSERTs) every request fails. Any function that rate limits must
-- be VOLATILE.
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.provolatile <> 'v'
     and p.prosrc ilike '%check_rate_limit%'
     and p.proname <> 'check_rate_limit'),
  0,
  'every function that calls check_rate_limit is VOLATILE'
);

select * from finish();
rollback;
