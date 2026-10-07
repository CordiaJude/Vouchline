import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";
import { SettingsSection } from "./settings-section";
import { StickerModeToggle } from "./sticker-mode-toggle";
import { PublicProfileToggle } from "./public-profile-toggle";
import { QuietHoursSettings } from "./quiet-hours-settings";
import { DeleteAccount } from "./delete-account";
import { BlockedList } from "./blocked-list";
import { InterestsSettings } from "./interests-settings";
import { VerifyEmailCard } from "./verify-email-card";
import { heading1, btnSecondarySmall } from "@/app/components/ui/styles";
import { signOut } from "@/app/app/actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, full_name, headline, grad_year, pledge_class, employer, city, linkedin_url, avatar_url, sticker_mode, is_public, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone, interests, goals, status, job_title, industry, school_id, school_name, major, username, verified_school_domain, verified_work_domain",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding");
  }

  // Admin entry point for phones -- the desktop rail's More menu has it too.
  const { data: adminOrg } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const { data: blockedRows } = await supabase
    .from("blocks")
    .select("blocked_id, blocked:profiles!blocks_blocked_id_fkey(full_name)")
    .eq("blocker_id", user.id);
  const blocked = (blockedRows ?? []).map((b) => ({
    blocked_id: b.blocked_id,
    full_name: (b.blocked as unknown as { full_name: string } | null)?.full_name ?? "Unknown",
  }));

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-2xl">
        <h1 className={heading1}>
          Settings
        </h1>

        <div className="mt-6">
          <SettingsForm profile={profile} />
        </div>

        <SettingsSection title="Verification">
          <p className="mb-3 text-sm text-muted">
            Get a blue check on your profile by confirming your school or work email.
          </p>
          <div className="flex flex-col gap-3">
            <VerifyEmailCard kind="work" verifiedDomain={profile.verified_work_domain} />
            <VerifyEmailCard kind="school" verifiedDomain={profile.verified_school_domain} />
          </div>
        </SettingsSection>

        <SettingsSection title="Interests">
          <InterestsSettings interests={profile.interests ?? []} goals={profile.goals ?? []} />
        </SettingsSection>

        <SettingsSection title="Connecting">
          <StickerModeToggle enabled={profile.sticker_mode} />
          <PublicProfileToggle enabled={profile.is_public} />
        </SettingsSection>

        <SettingsSection title="Notifications">
          <QuietHoursSettings
            enabled={profile.quiet_hours_enabled}
            start={profile.quiet_hours_start}
            end={profile.quiet_hours_end}
            timezone={profile.timezone}
          />
        </SettingsSection>

        <SettingsSection title="Blocked">
          <BlockedList blocked={blocked} />
        </SettingsSection>

        <SettingsSection title="Account">
          <div className="flex flex-wrap gap-2">
            {adminOrg && (
              <Link href={`/app/admin/${adminOrg.org_id}`} className={btnSecondarySmall}>
                Org admin
              </Link>
            )}
            <form action={signOut}>
              <button type="submit" className={btnSecondarySmall}>
                Log out
              </button>
            </form>
          </div>
        </SettingsSection>

        <SettingsSection title="Danger zone">
          <DeleteAccount />
        </SettingsSection>

        <div className="mt-10 flex gap-4 text-xs text-muted">
          <Link href="/terms" className="underline">
            Terms
          </Link>
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
          <Link href="/acceptable-use" className="underline">
            Acceptable use
          </Link>
        </div>
      </div>
    </div>
  );
}
