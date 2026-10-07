import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/app/components/app-nav";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Suspended or deleted accounts can still sign in; send them somewhere clear.
  const { data: accountState } = await supabase.rpc("my_account_state");
  if (accountState === "inactive") {
    redirect("/account-unavailable");
  }

  const [{ data: adminOrg }, { data: unreadCount }, { data: me }, { data: unreadMessages }, { data: isModerator }] = await Promise.all([
    supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    supabase.rpc("unread_notification_count"),
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle(),
    supabase.rpc("unread_conversation_count"),
    supabase.rpc("am_platform_admin"),
  ]);

  return (
    <div className="min-h-screen">
      <AppNav
        adminOrgId={adminOrg?.org_id ?? null}
        unreadNotifications={unreadCount ?? 0}
        unreadMessages={unreadMessages ?? 0}
        isModerator={isModerator === true}
        me={{ id: user.id, name: me?.full_name ?? "You", avatarUrl: me?.avatar_url ?? null }}
      />
      {/* Phones: h-14 top bar + bottom tab bar. Desktop: left rail,
          72px (md/lg) or 244px (xl). */}
      <div className="pb-[calc(6.25rem+env(safe-area-inset-bottom))] pt-[calc(3.5rem+env(safe-area-inset-top))] md:pb-0 md:pl-[72px] md:pt-0 xl:pl-[244px]">
        {children}
      </div>
    </div>
  );
}
