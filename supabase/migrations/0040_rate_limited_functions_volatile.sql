-- ===== Fix: rate-limited functions must be VOLATILE =====
-- private.check_rate_limit() records each call with an INSERT. PostgREST
-- runs STABLE/IMMUTABLE functions inside a READ ONLY transaction, so every
-- STABLE function that calls it failed on every request with
--   25006: cannot execute INSERT in a read-only transaction
-- and the app showed that as "no results": search, "Someone I want to
-- meet", intro paths (find_brokers), company pages, the network map
-- (public_graph), suggestions and find-friends were all affected.
--
-- Mark every function that calls the rate limiter VOLATILE. Done by
-- catalog lookup rather than a hand list so none are missed.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.provolatile <> 'v'
      and p.prosrc ilike '%check_rate_limit%'
      and p.proname <> 'check_rate_limit'
  loop
    execute format('alter function %s volatile', f);
    raise notice 'now volatile: %', f;
  end loop;
end $$;

-- Make PostgREST pick up the change immediately.
notify pgrst, 'reload schema';
