-- Local-only seed data: 2 orgs, ~100 fake users/profiles, roster
-- memberships, and ~600 confirmed connections with randomized answers.
-- Inserts straight into auth.users, which only works against a local
-- Supabase stack (never run this against a hosted/production project).

do $$
declare
  chapter_id uuid;
  alumni_id uuid;
  uid uuid;
  user_ids uuid[] := '{}';
  i int;
  a_idx int;
  b_idx int;
  a uuid;
  b uuid;
  rel_types public.rel_type[] := array['org_member','mentor','coworker','classmate','friend','family','best_friend','business_contact'];
  pledge_classes text[] := array['Alpha 2010','Beta 2012','Gamma 2014','Delta 2016','Epsilon 2018','Zeta 2020','Eta 2022','Theta 2024'];
  lo_rel public.rel_type;
  hi_rel public.rel_type;
  lo_years smallint;
  hi_years smallint;
  lo_strength smallint;
  hi_strength smallint;
  inserted int := 0;
  attempts int := 0;
  rows_affected int;
  conn_id uuid;
begin
  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'ATO Beta Chapter', 'ato-beta', 'chapter')
  returning id into chapter_id;

  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'ATO Beta Alumni Association', 'ato-beta-alumni', 'alumni_association')
  returning id into alumni_id;

  for i in 1..100 loop
    uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      'seed_user_' || i || '@example.com', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', ''
    );

    insert into public.profiles (id, full_name, headline, grad_year, pledge_class, employer, city, linkedin_url, is_18_plus)
    values (
      uid, 'Seed User ' || i, 'Chapter member', 1990 + (i % 30),
      pledge_classes[1 + (i % array_length(pledge_classes, 1))],
      'Acme Co', 'Chicago', 'https://www.linkedin.com/in/seeduser' || i, true
    );

    user_ids := array_append(user_ids, uid);

    if i <= 60 then
      insert into public.memberships (org_id, user_id, role, status)
      values (chapter_id, uid, case when i = 1 then 'admin' else 'member' end::public.org_role, 'active');
    else
      insert into public.memberships (org_id, user_id, role, status)
      values (alumni_id, uid, 'member', 'active');
    end if;
  end loop;

  -- ~600 confirmed connections, drawn from same-org pairs (1..60 = chapter,
  -- 61..100 = alumni) so they mirror what request_connection/redeem would
  -- allow. Independent lo/hi answers so some pairs land on eff_type = null.
  while inserted < 600 and attempts < 20000 loop
    attempts := attempts + 1;

    if random() < 0.6 then
      a_idx := 1 + floor(random() * 60)::int;
      b_idx := 1 + floor(random() * 60)::int;
    else
      a_idx := 61 + floor(random() * 40)::int;
      b_idx := 61 + floor(random() * 40)::int;
    end if;

    continue when a_idx = b_idx;

    a := user_ids[a_idx];
    b := user_ids[b_idx];
    if a > b then
      a := user_ids[b_idx];
      b := user_ids[a_idx];
    end if;

    lo_rel := rel_types[1 + floor(random() * array_length(rel_types, 1))::int];
    hi_rel := rel_types[1 + floor(random() * array_length(rel_types, 1))::int];
    lo_years := floor(random() * 11)::smallint;
    hi_years := floor(random() * 11)::smallint;
    lo_strength := (1 + floor(random() * 5))::smallint;
    hi_strength := (1 + floor(random() * 5))::smallint;

    insert into public.connections (
      user_lo, user_hi, initiated_by, source,
      lo_years, lo_strength, lo_answered_at,
      hi_years, hi_strength, hi_answered_at
    ) values (
      a, b, a, 'qr',
      lo_years, lo_strength, now(),
      hi_years, hi_strength, now()
    )
    on conflict (user_lo, user_hi) do nothing
    returning id into conn_id;

    get diagnostics rows_affected = row_count;
    if rows_affected > 0 then
      -- Independent lo/hi category picks, same as the independent
      -- lo/hi rel_type picks above -- some pairs land on a primary
      -- mismatch (eff_type follows the lower user_id's pick), most
      -- don't, matching real usage.
      insert into public.connection_categories (connection_id, side, category, is_primary) values
        (conn_id, 'lo', lo_rel, true),
        (conn_id, 'hi', hi_rel, true);
      inserted := inserted + 1;
    end if;
  end loop;
end $$;
