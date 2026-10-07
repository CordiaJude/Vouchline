import "server-only";
import { cache } from "react";
import { createAnonClient } from "@/lib/supabase/anon";

export type PublicCard = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  headline: string | null;
  city: string | null;
  school_name: string | null;
  connections_count: number;
  verified_school_domain: string | null;
  verified_work_domain: string | null;
};

// "/@jordan" -> "jordan"; anything without the @ isn't a profile link.
export function usernameFromHandle(handle: string): string | null {
  const h = decodeURIComponent(handle);
  return h.startsWith("@") && h.length > 1 ? h.slice(1).toLowerCase() : null;
}

// Shared by the page, its metadata and its preview image (one query per request).
export const getPublicCard = cache(async (username: string): Promise<PublicCard | null> => {
  const { data } = await createAnonClient().rpc("public_profile_card", { p_username: username }).maybeSingle();
  return (data as PublicCard | null) ?? null;
});
