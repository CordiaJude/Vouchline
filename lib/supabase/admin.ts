import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client for server-only use: reading auth.users emails via
// the admin API, and anything else that needs to bypass RLS. Never import
// this from a Client Component or anything that ends up in the browser
// bundle -- Phase 8 audits for that.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export async function getAuthEmail(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return data.user.email ?? null;
}
