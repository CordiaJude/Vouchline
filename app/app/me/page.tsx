import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileAbout } from "@/app/components/profile-about";
import { CategoryList, type CategoryEntry } from "@/app/components/category-list";
import { Avatar } from "@/app/components/avatar";
import { Icon } from "@/app/components/icons";
import type { ContactRow } from "@/app/components/contact-request-row";
import { profileCompleteness } from "@/lib/profile-completeness";
import { interestLabel } from "@/lib/interests";
import { btnSecondarySmall } from "@/app/components/ui/styles";
import { openDirectChat } from "@/app/app/messages/actions";

// The You tab: an Instagram-style profile header (photo, counts, bio,
// actions), then About / People. Settings is the gear, not a tab.

type MyConnection = {
  other_id: string;
  full_name: string;
  eff_years: number | null;
  my_categories: CategoryEntry[];
  status: string;
  avatar_url: string | null;
};

export default async function YouPage({ searchParams }: PageProps<"/app/me">) {
  const { tab } = await searchParams;
  const activeTab = tab === "people" || tab === "connections" ? "people" : "about";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, full_name, headline, grad_year, pledge_class, employer, city, linkedin_url, avatar_url, reach_score, interests, job_title, industry, school_name, major, status",
    )
    .eq("id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const [{ data: stats }, { data: connectionsData }, { data: contactData }] = await Promise.all([
    supabase.rpc("dashboard_stats").single(),
    supabase.rpc("my_connections"),
    supabase.rpc("my_contacts"),
  ]);
  const s = stats as { connections_count: number; orgs_count: number } | null;
  const connections = ((connectionsData ?? []) as MyConnection[])
    .filter((c) => c.status === "confirmed")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const contacts = ((contactData ?? []) as ContactRow[]).filter((c) => c.status === "accepted");
  const completeness = profileCompleteness(profile);
  const subline = [profile.employer, profile.city].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto w-full max-w-[935px] px-4 py-4 md:px-8 md:py-10">
      {/* Header */}
      <div className="flex items-center justify-between md:hidden">
        <h1 className="truncate text-xl font-bold text-ink">{profile.full_name}</h1>
        <Link href="/app/settings" aria-label="Settings" className="-mr-2 flex h-10 w-10 items-center justify-center text-ink">
          <Icon name="gear" className="h-6 w-6" />
        </Link>
      </div>

      <header className="mt-4 flex items-center gap-6 md:mt-0 md:gap-16 md:px-10">
        <span className="ring-brand-gradient p-[3px]">
          <span className="block rounded-full bg-page p-[3px]">
            <span className="md:hidden">
              <Avatar id={profile.id} name={profile.full_name} src={profile.avatar_url} size={80} />
            </span>
            <span className="hidden md:block">
              <Avatar id={profile.id} name={profile.full_name} src={profile.avatar_url} size={128} />
            </span>
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="hidden items-center gap-3 md:flex">
            <h1 className="truncate text-xl font-semibold text-ink">{profile.full_name}</h1>
            <Link href="/app/settings" className={btnSecondarySmall}>
              Edit profile
            </Link>
            <Link href="/app/settings" aria-label="Settings" className="flex h-9 w-9 items-center justify-center text-ink">
              <Icon name="gear" className="h-6 w-6" />
            </Link>
          </div>
          <dl className="flex justify-around text-center md:mt-5 md:justify-start md:gap-10 md:text-left">
            <Count href="/app/network" value={s?.connections_count ?? connections.length} label="connections" />
            <Count href="/app/explore?view=map" value={profile.reach_score ?? 0} label="reachable" />
            <Count href="/app/me?tab=people" value={contacts.length} label="contacts" />
          </dl>
          <div className="mt-5 hidden md:block">
            <Bio headline={profile.headline} subline={subline} interests={profile.interests ?? []} linkedin={profile.linkedin_url} />
          </div>
        </div>
      </header>

      <div className="mt-4 md:hidden">
        <Bio headline={profile.headline} subline={subline} interests={profile.interests ?? []} linkedin={profile.linkedin_url} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/app/settings" className={`${btnSecondarySmall} bg-fill`}>
            Edit profile
          </Link>
          <Link href="/app/connect" className={`${btnSecondarySmall} bg-fill`}>
            Share profile
          </Link>
        </div>
      </div>

      {/* Private to you: no one else ever sees this. */}
      {completeness.percent < 100 && (
        <Link
          href="/app/settings"
          className="mt-6 flex items-center gap-4 rounded-card border border-border bg-surface p-4 md:mx-10"
        >
          <span className="text-sm font-bold text-ink">{completeness.percent}%</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-body">Add your {completeness.nextMissingLabel} to finish your profile</span>
            <span className="mt-2 block h-1 overflow-hidden rounded-pill bg-fill">
              <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <rect x="0" y="0" width={completeness.percent} height="100" fill="var(--ink)" />
              </svg>
            </span>
          </span>
          <Icon name="chevronRight" className="h-4 w-4 text-muted" />
        </Link>
      )}

      {/* Tabs: icon + label, top border marks the active one (Instagram) */}
      <nav className="mt-8 flex justify-center gap-14 border-t border-border" aria-label="Profile sections">
        <TabLink href="/app/me" active={activeTab === "about"} icon="user" label="About" />
        <TabLink href="/app/me?tab=people" active={activeTab === "people"} icon="users" label="People" />
      </nav>

      <div className="mx-auto mt-6 max-w-2xl">
        {activeTab === "about" ? (
          <ProfileAbout profile={profile} />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">Connections</h2>
              <Link href="/app/network" className="text-sm font-semibold text-link hover:underline">
                Manage & visibility
              </Link>
            </div>
            {connections.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No confirmed connections yet.{" "}
                <Link href="/app/connect" className="font-semibold text-link hover:underline">
                  Show your code
                </Link>{" "}
                to someone you know.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {connections.map((c) => (
                  <li key={c.other_id}>
                    <Link href={`/app/u/${c.other_id}`} className="-mx-2 flex items-center gap-3 rounded-input px-2 py-2.5 hover:bg-fill">
                      <Avatar id={c.other_id} name={c.full_name} src={c.avatar_url} size={48} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{c.full_name}</p>
                        <div className="mt-0.5">
                          <CategoryList categories={c.my_categories} />
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {contacts.length > 0 && (
              <>
                <h2 className="mt-8 text-base font-bold text-ink">Contacts</h2>
                <p className="mt-0.5 text-xs text-muted">Added, but not a confirmed connection yet.</p>
                <ul className="mt-2 flex flex-col">
                  {contacts.map((c) => (
                    <li key={c.request_id} className="-mx-2 flex items-center gap-3 rounded-input px-2 py-2.5">
                      <Link href={`/app/u/${c.other_id}`}>
                        <Avatar id={c.other_id} name={c.full_name} src={c.avatar_url} size={48} />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/app/u/${c.other_id}`} className="block truncate text-sm font-semibold text-ink hover:underline">
                          {c.full_name}
                        </Link>
                        {c.headline && <p className="truncate text-xs text-muted">{c.headline}</p>}
                      </div>
                      <form action={openDirectChat}>
                        <input type="hidden" name="person_id" value={c.other_id} />
                        <button type="submit" className={btnSecondarySmall}>
                          Message
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Count({ href, value, label }: { href: string; value: number; label: string }) {
  return (
    <Link href={href} className="flex flex-col md:flex-row md:items-baseline md:gap-1.5">
      <dd className="text-base font-bold text-ink">{value}</dd>
      <dt className="text-sm text-muted md:text-body">{label}</dt>
    </Link>
  );
}

function Bio({
  headline,
  subline,
  interests,
  linkedin,
}: {
  headline: string | null;
  subline: string;
  interests: string[];
  linkedin: string | null;
}) {
  return (
    <div className="text-sm">
      {headline && <p className="font-semibold text-ink">{headline}</p>}
      {subline && <p className="text-muted">{subline}</p>}
      {interests.length > 0 && <p className="mt-1 text-body">{interests.slice(0, 6).map(interestLabel).join(" · ")}</p>}
      {linkedin && (
        <a href={linkedin} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold text-link hover:underline">
          LinkedIn
        </a>
      )}
    </div>
  );
}

function TabLink({ href, active, icon, label }: { href: string; active: boolean; icon: "user" | "users"; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`-mt-px flex h-12 items-center gap-1.5 border-t text-xs font-semibold uppercase tracking-[0.08em] ${
        active ? "border-ink text-ink" : "border-transparent text-muted hover:text-body"
      }`}
    >
      <Icon name={icon} className="h-3.5 w-3.5" filled={active} />
      {label}
    </Link>
  );
}
