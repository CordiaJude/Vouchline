import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cookie-less client for public, signed-out reads (share-link pages and
// their preview images). Only reaches RPCs granted to `anon`, e.g.
// public_profile_card.
export function createAnonClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
