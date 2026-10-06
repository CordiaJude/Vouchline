import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PersonSearch } from "@/app/app/search/person-search";
import { PeopleYouMayKnow } from "@/app/app/search/people-you-may-know";
import { NetworkOrb } from "@/app/app/network/network-orb";
import { SuggestedPersonCard, type SuggestedPerson } from "@/app/components/suggested-person-card";
import { EmptyState } from "@/app/components/empty-state";
import { Icon } from "@/app/components/icons";
import { buildCommunityGraph, type PublicGraphEdge } from "@/lib/community-graph";
import { interestLabel, goalLabel } from "@/lib/interests";

// Explore: find anyone. One search box on top, then three ways to browse:
//   people    -- interest-based suggestions + people you may know
//   companies -- browse by employer
//   map       -- your extended network as the orb (public connections)
// Replaces the old Search, Companies, and Discover entry points; /app/search
// still serves "find a path to X" (?target=).

const VIEWS = [
  { key: "people", label: "People" },
  { key: "companies", label: "Companies" },
  { key: "map", label: "Map" },
] as const;
type View = (typeof VIEWS)[number]["key"];

type Company = { employer: string; member_count: number };

export default async function ExplorePage({ searchParams }: PageProps<"/app/explore">) {
  const { view: rawView, for: purpose } = await searchParams;
  const view: View = rawView === "companies" || rawView === "map" ? rawView : "people";
  const connectMode = purpose === "connect";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let suggested: SuggestedPerson[] = [];
  let roster: { id: string; full_name: string; headline: string | null; avatar_url: string | null; detail: string | null }[] = [];
  let employerOverlap: typeof roster = [];
  let companies: Company[] = [];
  let graph: ReturnType<typeof buildCommunityGraph> | null = null;

  if (view === "people") {
    const [{ data: sug }, { data: rosterData }, { data: employerData }] = await Promise.all([
      supabase.rpc("suggest_people", { p_limit: 24 }),
      supabase.rpc("suggest_from_roster"),
      supabase.rpc("employer_overlap_suggestions"),
    ]);
    suggested = ((sug ?? []) as Omit<SuggestedPerson, "reasons">[]).map((p) => ({
      ...p,
      reasons: [...(p.shared_interests ?? []).map(interestLabel), ...(p.shared_goals ?? []).map(goalLabel)],
    }));
    roster = (
      (rosterData ?? []) as {
        id: string;
        full_name: string;
        headline: string | null;
        avatar_url: string | null;
        pledge_class: string | null;
        grad_year: number | null;
      }[]
    ).map((s) => ({
      id: s.id,
      full_name: s.full_name,
      headline: s.headline,
      avatar_url: s.avatar_url,
      detail: [s.pledge_class, s.grad_year].filter(Boolean).join(" · ") || null,
    }));
    employerOverlap = (
      (employerData ?? []) as {
        id: string;
        full_name: string;
        headline: string | null;
        avatar_url: string | null;
        employer: string | null;
      }[]
    ).map((s) => ({ id: s.id, full_name: s.full_name, headline: s.headline, avatar_url: s.avatar_url, detail: s.employer }));
  } else if (view === "companies") {
    const { data } = await supabase.rpc("list_companies");
    companies = (data ?? []) as Company[];
  } else {
    const { data } = await supabase.rpc("public_graph");
    graph = buildCommunityGraph((data ?? []) as PublicGraphEdge[], user.id);
  }

  return (
    <div className="mx-auto w-full max-w-[935px] px-4 py-4 md:px-8 md:py-10">
      <h1 className="sr-only">Explore</h1>

      {connectMode && (
        <div className="mb-4 flex items-start gap-3 rounded-card border border-border bg-surface p-4">
          <Icon name="userPlus" className="mt-0.5 h-5 w-5 shrink-0 text-ink" />
          <p className="text-sm text-body">
            Search for the person you know, open their profile, and tap{" "}
            <span className="font-semibold text-ink">Connect</span> to confirm how you know each other.
          </p>
        </div>
      )}

      <PersonSearch />

      <nav className="-mx-4 mt-6 flex border-b border-border px-4 md:mx-0 md:px-0" aria-label="Explore sections">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.key === "people" ? "/app/explore" : `/app/explore?view=${v.key}`}
            aria-current={view === v.key ? "page" : undefined}
            className={`-mb-px flex-1 border-b-2 pb-3 pt-1 text-center text-sm font-semibold transition-colors md:flex-none md:px-6 ${
              view === v.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-body"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === "people" && (
        <>
          {suggested.length > 0 ? (
            <section className="mt-6">
              <h2 className="text-base font-bold text-ink">Suggested for you</h2>
              <p className="mt-0.5 text-sm text-muted">
                Based on your interests.{" "}
                <Link href="/app/settings" className="font-semibold text-link hover:underline">
                  Edit interests
                </Link>
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {suggested.map((p) => (
                  <SuggestedPersonCard key={p.id} person={p} />
                ))}
              </div>
            </section>
          ) : (
            <p className="mt-6 text-sm text-muted">
              Search above, or{" "}
              <Link href="/app/settings" className="font-semibold text-link hover:underline">
                add your interests
              </Link>{" "}
              to get suggestions.
            </p>
          )}
          <PeopleYouMayKnow roster={roster} employerOverlap={employerOverlap} />
        </>
      )}

      {view === "companies" &&
        (companies.length === 0 ? (
          <EmptyState
            headline="No companies to browse yet"
            detail="Companies show up once people in your network add where they work."
          />
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {companies.map((c) => (
              <li key={c.employer}>
                <Link
                  href={`/app/companies/${encodeURIComponent(c.employer)}`}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 hover:bg-fill"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input bg-fill text-base font-bold text-ink">
                    {c.employer.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{c.employer}</span>
                    <span className="block text-xs text-muted">
                      {c.member_count} {c.member_count === 1 ? "person" : "people"}
                    </span>
                  </span>
                  <Icon name="chevronRight" className="h-4 w-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        ))}

      {view === "map" && (
        <section className="mt-4">
          <p className="text-sm text-muted">
            Your connections, their public connections, and theirs, out to 6 steps. Private connections only show
            to the two people in them.
          </p>
          {graph && graph.links.length > 0 ? (
            <NetworkOrb mode="community" nodes={graph.nodes} links={graph.links} />
          ) : (
            <EmptyState
              headline="Your map is empty"
              detail="Once you and the people you know mark connections Public, your extended network appears here."
              cta={{ label: "Manage your connections", href: "/app/network" }}
            />
          )}
        </section>
      )}
    </div>
  );
}
