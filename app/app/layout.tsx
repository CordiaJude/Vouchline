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

  const [{ data: adminOrg }, { data: unreadCount }, { data: me }] = await Promise.all([
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
  ]);

  return (
    <div className="min-h-screen">
      <AppNav
        adminOrgId={adminOrg?.org_id ?? null}
        unreadNotifications={unreadCount ?? 0}
        me={{ id: user.id, name: me?.full_name ?? "You", avatarUrl: me?.avatar_url ?? null }}
      />
      {/* Phones: h-14 top bar + bottom tab bar. Desktop: left rail,
          72px (md/lg) or 244px (xl). */}
      <div className="pb-20 pt-14 md:pb-0 md:pl-[72px] md:pt-0 xl:pl-[244px]">{children}</div>
    </div>
  );
}
