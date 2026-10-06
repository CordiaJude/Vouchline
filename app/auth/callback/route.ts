import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirect_to") ?? "/app";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const user = data.user;
      if (user) {
        // Only ever fires before onboarding creates a profile row, so a
        // user who re-requests a magic link before onboarding is the
        // only way to double-log this -- acceptable noise for pilot
        // analytics, and log_event's own rate limit bounds the damage.
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();
        if (!profile) {
          await supabase.rpc("log_event", { p_name: "signup" });
        } else {
          // Cached, refreshed on login rather than computed live on every
          // dashboard render -- see recompute_my_reach_score().
          await supabase.rpc("recompute_my_reach_score");
        }
      }
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
