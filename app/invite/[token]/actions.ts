"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function joinOrg(token: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.rpc("redeem_org_invite", {
    p_token: token,
  });

  if (error) {
    redirect(`/invite/${token}?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/app");
}
