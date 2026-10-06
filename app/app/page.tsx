import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/app/components/avatar";
import { Icon } from "@/app/components/icons";
import { SuggestedPersonCard, type SuggestedPerson } from "@/app/components/suggested-person-card";
import { ContactRequestRow, type ContactRow } from "@/app/components/contact-request-row";
import { interestLabel, goalLabel } from "@/lib/interests";
import { profileCompleteness } from "@/lib/profile-completeness";
import { nextStep } from "@/lib/dashboard-next-step";
import { btnPrimarySmall, btnSecondarySmall } from "@/app/components/ui/styles";

// Home: what needs you first (inbox-zero action cards), then what's new
// in your network. Counts and stats live on the You tab, not here.

type PendingConn = { connection_id: string; full_name: string };
type ReachablePerson = { id: string; full_name: string; headline: string | null; avatar_url: string | null };
type ActivityItem = {
  kind: string;
  headline: string;
  person_id: string | null;
  avatar_url: string | null;
  happened_at: string;
};
type DashboardStats = {
  connections_count: number;
  orgs_count: number;
  open_intros_count: number;
  pending_confirmations_count: number;
};
type Person = { id: string; full_name: string; avatar_url: string | null } | null;
type IntroAsk = { id: string; ask: string; created_at: string; requester: Person; broker: Person; target: Person };

const INTRO_COLS =
  "id, ask, created_at, requester:profiles!intro_requests_requester_id_fkey(id, full_name, avatar_url), broker:profiles!intro_requests_broker_id_fkey(id, full_name, avatar_url), target:profiles!intro_requests_target_id_fkey(id, full_name, avatar_url)";

function activityLabel(item: ActivityItem): string {
  switch (item.kind) {
    case "connection_confirmed":
      return `You connected with ${item.headline}`;
    case "intro_accepted":
      return `You're introduced to ${item.headline}`;
    case "roster_join":
      return `${item.headline} joined your org`;
    default:
      return item.headline;
  }
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, reach_score, headline, employer, city, grad_year, pledge_class, linkedin_url")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const [
    { data: stats },
    { data: pending },
    { data: reachable },
    { data: activity },
    { data: contacts },
    { data: brokerAsks },
    { data: targetAsks },
    { data: suggestedData },
  ] = await Promise.all([
    supabase.rpc("dashboard_stats").single(),
    supabase.rpc("pending_for_me"),
    supabase.rpc("dashboard_reachable_sample"),
    supabase.rpc("my_activity_feed"),
    supabase.rpc("my_contacts"),
    supabase
      .from("intro_requests")
      .select(INTRO_COLS)
      .eq("broker_id", user.id)
      .eq("status", "pending_broker")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("intro_requests")
      .select(INTRO_COLS)
      .eq("target_id", user.id)
      .eq("status", "pending_target")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.rpc("suggest_people", { p_limit: 10 }),
  ]);

  const s = stats as DashboardStats | null;
  const pendingList = (pending ?? []) as PendingConn[];
  const reachableList = (reachable ?? []) as ReachablePerson[];
  const activityList = (activity ?? []) as ActivityItem[];
  const contactRequests = ((contacts ?? []) as ContactRow[]).filter((c) => c.incoming && c.status === "pending");
  const toPassOn = (brokerAsks ?? []) as unknown as IntroAsk[];
  const forYou = (targetAsks ?? []) as unknown as IntroAsk[];
  const suggested: SuggestedPerson[] = ((suggestedData ?? []) as Omit<SuggestedPerson, "reasons">[]).map((p) => ({
    ...p,
    reasons: [...(p.shared_interests ?? []).map(interestLabel), ...(p.shared_goals ?? []).map(goalLabel)],
  }));

  const completeness = profileCompleteness(profile);
  const step = nextStep({
    completenessPercent: completeness.percent,
    nextMissingLabel: completeness.nextMissingLabel,
    connectionsCount: s?.connections_count ?? 0,
    pendingCount: pendingList.length,
    openIntrosCount: s?.open_intros_count ?? 0,
  });

  const needsYouCount = toPassOn.length + forYou.length + pendingList.length + contactRequests.length;

  return (
    <div className="mx-auto flex w-full max-w-[1000px] gap-12 px-4 py-4 md:py-8">
      {/* ===== Feed column ===== */}
      <div className="mx-auto w-full max-w-[600px] min-w-0">
        {/* People you can reach: a stories-style row */}
        {reachableList.length > 0 && (
          <section aria-label="People you can reach" className="-mx-4 border-b border-border pb-4 md:mx-0 md:border-none">
            <ul className="flex gap-4 overflow-x-auto px-4 md:px-0">
              {reachableList.map((p) => (
                <li key={p.id} className="w-[72px] shrink-0">
                  <Link href={`/app/u/${p.id}`} className="flex flex-col items-center gap-1.5 text-center">
                    <span className="ring-brand-gradient p-[2.5px]">
                      <span className="block rounded-full bg-page p-[2.5px]">
                        <Avatar id={p.id} name={p.full_name} src={p.avatar_url} size={56} />
                      </span>
                    </span>
                    <span className="w-full truncate text-xs text-ink">{p.full_name.split(" ")[0]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Needs you */}
        <section className="mt-6">
          <SectionHeader title="Needs you" count={needsYouCount} />
          {needsYouCount === 0 ? (
            <div className="mt-3 rounded-card border border-border bg-surface p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-fill">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
                You&apos;re all caught up
              </div>
              <p className="mt-3 text-base font-bold text-ink">{step.headline}</p>
              <p className="mt-0.5 text-sm text-muted">{step.detail}</p>
              <Link href={step.href} className={`${btnPrimarySmall} mt-4`}>
                {step.cta}
              </Link>
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {toPassOn.map((i) => (
                <ActionCard
                  key={i.id}
                  person={i.requester}
                  title={
                    <>
                      <b className="font-bold">{i.requester?.full_name}</b> wants you to introduce them to{" "}
                      <b className="font-bold">{i.target?.full_name}</b>
                    </>
                  }
                  detail={i.ask}
                  href={`/app/intros/${i.id}`}
                  cta="Review"
                />
              ))}
              {forYou.map((i) => (
                <ActionCard
                  key={i.id}
                  person={i.requester}
                  title={
                    <>
                      <b className="font-bold">{i.broker?.full_name}</b> wants to introduce you to{" "}
                      <b className="font-bold">{i.requester?.full_name}</b>
                    </>
                  }
                  detail={i.ask}
                  href={`/app/intros/${i.id}`}
                  cta="Review"
                />
              ))}
              {pendingList.slice(0, 3).map((p) => (
                <ActionCard
                  key={p.connection_id}
                  person={null}
                  title={
                    <>
                      Confirm how you know <b className="font-bold">{p.full_name}</b>
                    </>
                  }
                  detail="They added you. Confirm to make the connection count."
                  href="/app/connections/pending"
                  cta="Confirm"
                />
              ))}
              {pendingList.length > 3 && (
                <li>
                  <Link href="/app/connections/pending" className="block px-1 py-2 text-sm font-semibold text-link hover:underline">
                    {pendingList.length - 3} more to confirm
                  </Link>
                </li>
              )}
              {contactRequests.map((c) => (
                <li key={c.request_id}>
                  <ContactRequestRow c={c} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Suggested for you */}
        {suggested.length > 0 && (
          <section className="mt-10">
            <SectionHeader title="Suggested for you" href="/app/explore" linkLabel="See all" />
            <ul className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
              {suggested.map((p) => (
                <li key={p.id} className="w-44 shrink-0 snap-start">
                  <SuggestedPersonCard person={p} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* What's new */}
        <section className="mt-10">
          <SectionHeader title="What's new" />
          {activityList.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Nothing yet. Connections and intros in your network show up here.
            </p>
          ) : (
            <ul className="mt-1 flex flex-col">
              {activityList.map((item, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  {item.person_id ? (
                    <Link href={`/app/u/${item.person_id}`}>
                      <Avatar id={item.person_id} name={item.headline} src={item.avatar_url} size={40} />
                    </Link>
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill text-ink" role="img" aria-label="Two people">
                      <Icon name="users" className="h-5 w-5" />
                    </span>
                  )}
                  <p className="min-w-0 flex-1 text-sm text-body">
                    {activityLabel(item)} <span className="text-muted">· {timeAgo(item.happened_at)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ===== Right rail (wide screens), Instagram-web style ===== */}
      <aside className="hidden w-[300px] shrink-0 pt-2 lg:block">
        <Link href="/app/me" className="flex items-center gap-3">
          <Avatar id={profile.id} name={profile.full_name} src={profile.avatar_url} size={48} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-ink">{profile.full_name}</span>
            <span className="block truncate text-sm text-muted">{profile.headline ?? "View your profile"}</span>
          </span>
        </Link>
        <dl className="mt-5 grid grid-cols-3 gap-2 rounded-card border border-border bg-surface p-4 text-center">
          <Stat label="Connections" value={s?.connections_count ?? 0} />
          <Stat label="Reachable" value={profile.reach_score ?? 0} />
          <Stat label="Open intros" value={s?.open_intros_count ?? 0} />
        </dl>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/app/intros?tab=want" className={`${btnSecondarySmall} justify-start`}>
            <Icon name="target" className="h-4 w-4" /> People I want to meet
          </Link>
          <Link href="/app/network?view=orb&scope=everyone" className={`${btnSecondarySmall} justify-start`}>
            <Icon name="map" className="h-4 w-4" /> Explore the map
          </Link>
        </div>
        <p className="mt-8 text-xs text-muted">
          <Link href="/terms" className="hover:underline">Terms</Link> ·{" "}
          <Link href="/privacy" className="hover:underline">Privacy</Link> ·{" "}
          <Link href="/acceptable-use" className="hover:underline">Acceptable use</Link>
        </p>
      </aside>
    </div>
  );
}

function SectionHeader({ title, count, href, linkLabel }: { title: string; count?: number; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        {title}
        {!!count && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent-gold px-1.5 text-[11px] font-bold text-white">
            {count}
          </span>
        )}
      </h2>
      {href && (
        <Link href={href} className="text-sm font-semibold text-link hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

function ActionCard({
  person,
  title,
  detail,
  href,
  cta,
}: {
  person: Person;
  title: ReactNode;
  detail: string;
  href: string;
  cta: string;
}) {
  return (
    <li className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
      {person ? (
        <Avatar id={person.id} name={person.full_name} src={person.avatar_url} size={48} />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-fill text-ink">
          <Icon name="userPlus" className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{title}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{detail}</p>
      </div>
      <Link href={href} className={btnPrimarySmall}>
        {cta}
      </Link>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="text-lg font-extrabold text-ink">{value}</dd>
      <dt className="text-[11px] font-semibold text-muted">{label}</dt>
    </div>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
