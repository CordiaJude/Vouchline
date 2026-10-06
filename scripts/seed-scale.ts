/**
 * Bulk-seeds a LOCAL Supabase Postgres instance with ~100k users and
 * ~3M directed connection_edges rows, for benchmarking find_brokers()
 * (see supabase/migrations/0004_paths.sql, Phase 5).
 *
 * Refuses to run against anything but localhost/127.0.0.1 — never point
 * this at a hosted or production database.
 *
 * Usage: npm run seed:scale
 * Env:   DATABASE_URL (defaults to the local Supabase CLI db)
 */
import { Pool } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const USER_COUNT = 100_000;
const ORG_COUNT = 2;
const TARGET_UNDIRECTED_CONNECTIONS = 1_500_000; // -> ~3M rows in connection_edges
const PROFILE_BATCH_SIZE = 1_000;
const CONNECTION_BATCH_SIZE = 2_000;
const MAX_CONNECTION_ATTEMPTS = TARGET_UNDIRECTED_CONNECTIONS * 3;

// A fixed, non-functional bcrypt-shaped placeholder — these accounts are
// never meant to log in, so there's no point paying bcrypt's cost 100k times.
const DUMMY_PASSWORD_HASH =
  "$2a$06$0000000000000000000000u0000000000000000000000000000";

function assertLocalDatabase(url: string) {
  const { hostname } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(
      `Refusing to run seed-scale against "${hostname}". This script is for local benchmarking only.`,
    );
  }
}

function randInt(maxExclusive: number) {
  return Math.floor(Math.random() * maxExclusive);
}

async function main() {
  assertLocalDatabase(DATABASE_URL);
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log(`Seeding ${DATABASE_URL} — this is a local benchmarking run.`);

  const orgIds: string[] = [];
  for (let i = 0; i < ORG_COUNT; i++) {
    const { rows } = await pool.query(
      `insert into public.orgs (name, slug, kind)
       values ($1, $2, 'chapter') returning id`,
      [`Bench Org ${i}`, `bench-org-${i}-${Date.now()}`],
    );
    orgIds.push(rows[0].id);
  }
  console.log(`Created ${orgIds.length} orgs.`);

  // userIds[i] = profile id, orgOf[i] = index into orgIds
  const userIds: string[] = [];
  const orgOf: number[] = [];

  for (let start = 0; start < USER_COUNT; start += PROFILE_BATCH_SIZE) {
    const batchSize = Math.min(PROFILE_BATCH_SIZE, USER_COUNT - start);
    const client = await pool.connect();
    try {
      await client.query("begin");

      const profileValues: string[] = [];
      const profileParams: unknown[] = [];
      const membershipValues: string[] = [];
      const membershipParams: unknown[] = [];

      // Bulk-insert via unnest() so we can capture the generated ids in
      // the same statement.
      const emails = Array.from(
        { length: batchSize },
        (_, j) => `bench_user_${start + j}@example.com`,
      );

      const { rows: insertedUsers } = await client.query(
        `insert into auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at
         )
         select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
                e, $2, now(), '{}', '{}', now(), now()
         from unnest($1::text[]) as e
         returning id`,
        [emails, DUMMY_PASSWORD_HASH],
      );

      const batchUserIds = insertedUsers.map((r) => r.id as string);

      for (let j = 0; j < batchSize; j++) {
        const idx = start + j;
        const uid = batchUserIds[j];
        const orgIdx = idx % ORG_COUNT;
        userIds.push(uid);
        orgOf.push(orgIdx);

        const pp = profileParams.length;
        profileParams.push(uid, `Bench User ${idx}`, 1990 + (idx % 30));
        profileValues.push(`($${pp + 1}, $${pp + 2}, $${pp + 3}, true)`);

        const mp = membershipParams.length;
        membershipParams.push(orgIds[orgIdx], uid);
        membershipValues.push(`($${mp + 1}, $${mp + 2}, 'member', 'active')`);
      }

      await client.query(
        `insert into public.profiles (id, full_name, grad_year, is_18_plus) values ${profileValues.join(",")}`,
        profileParams,
      );
      await client.query(
        `insert into public.memberships (org_id, user_id, role, status) values ${membershipValues.join(",")}`,
        membershipParams,
      );

      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }

    if ((start / PROFILE_BATCH_SIZE) % 10 === 0) {
      console.log(`  profiles: ${Math.min(start + PROFILE_BATCH_SIZE, USER_COUNT)}/${USER_COUNT}`);
    }
  }
  console.log(`Created ${userIds.length} users/profiles.`);

  // Group user indices by org so pairs are drawn within the same org,
  // matching what request_connection()/redeem_connect_token() would allow.
  const usersByOrg: number[][] = Array.from({ length: ORG_COUNT }, () => []);
  orgOf.forEach((orgIdx, i) => usersByOrg[orgIdx].push(i));

  let inserted = 0;
  let attempts = 0;

  while (inserted < TARGET_UNDIRECTED_CONNECTIONS && attempts < MAX_CONNECTION_ATTEMPTS) {
    const client = await pool.connect();
    try {
      await client.query("begin");

      const values: string[] = [];
      const params: unknown[] = [];

      for (let b = 0; b < CONNECTION_BATCH_SIZE; b++) {
        attempts++;
        const orgIdx = randInt(ORG_COUNT);
        const pool_ = usersByOrg[orgIdx];
        if (pool_.length < 2) continue;

        const aIdx = pool_[randInt(pool_.length)];
        const bIdx = pool_[randInt(pool_.length)];
        if (aIdx === bIdx) continue;

        let lo = userIds[aIdx];
        let hi = userIds[bIdx];
        if (lo > hi) [lo, hi] = [hi, lo];

        const loYears = randInt(11);
        const hiYears = randInt(11);
        const loStrength = 1 + randInt(5);
        const hiStrength = 1 + randInt(5);

        const p = params.length;
        params.push(lo, hi, lo, loYears, loStrength, hiYears, hiStrength);
        values.push(
          `($${p + 1}, $${p + 2}, $${p + 3}, 'qr', $${p + 4}, $${p + 5}, now(), $${p + 6}, $${p + 7}, now())`,
        );
      }

      if (values.length > 0) {
        // No connection_categories rows here on purpose: this script only
        // benchmarks find_brokers' graph traversal, which only needs
        // connection_edges rows to exist (driven by lo/hi_answered_at +
        // strength, not category) -- eff_type/eff_is_former staying null
        // doesn't affect path-finding or ranking at all.
        const { rowCount } = await client.query(
          `insert into public.connections (
             user_lo, user_hi, initiated_by, source,
             lo_years, lo_strength, lo_answered_at,
             hi_years, hi_strength, hi_answered_at
           ) values ${values.join(",")}
           on conflict (user_lo, user_hi) do nothing`,
          params,
        );
        inserted += rowCount ?? 0;
      }

      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }

    console.log(`  connections: ${inserted}/${TARGET_UNDIRECTED_CONNECTIONS} (attempts: ${attempts})`);
  }

  const { rows: counts } = await pool.query(`
    select
      (select count(*) from public.profiles) as profiles,
      (select count(*) from public.connections) as connections,
      (select count(*) from public.connection_edges) as edges
  `);
  console.log("Done:", counts[0]);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
