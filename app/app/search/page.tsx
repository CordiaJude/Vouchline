import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PersonSearch } from "./person-search";
import { PeopleYouMayKnow } from "./people-you-may-know";
import { PathResults } from "./path-results";
import { heading1, mutedText, link } from "@/app/components/ui/styles";

type RosterSuggestion = {
  id: string;
  full_name: string;
  headline: string | null;
  avatar_url: string | null;
  pledge_class: string | null;
  grad_year: number | null;
};

type EmployerSuggestion = {
  id: string;
  full_name: string;
  headline: string | null;
  avatar_url: string | null;
  employer: string | null;
};

type DetailSuggestion = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  detail: string | null;
};

type Broker = {
  broker_id: string;
  broker_name: string;
  broker_avatar_url: string | null;
  broker_headline: string | null;
  bridge_kind: "confirmed" | "claimed";
  my_rel: string | null;
  their_rel: string | null;
  rank: number;
};

export default async function SearchPage({
  searchParams,
}: PageProps<"/app/search">) {
  const { target: targetId } = await searchParams;
  // Plain search now lives in Explore; this page only serves "find a
  // path to X" (?target=), linked from profiles and the want-to-meet list.
  if (typeof targetId !== "string" || !targetId) {
    redirect("/app/explore");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: rosterData }, { data: employerData }] = await Promise.all([
    supabase.rpc("suggest_from_roster"),
    supabase.rpc("employer_overlap_suggestions"),
  ]);

  const roster = ((rosterData ?? []) as RosterSuggestion[]).map((s) => ({
    id: s.id,
    full_name: s.full_name,
    headline: s.headline,
    avatar_url: s.avatar_url,
    detail: [s.pledge_class, s.grad_year].filter(Boolean).join(" · ") || null,
  }));

  const employerOverlap = ((employerData ?? []) as EmployerSuggestion[]).map((s) => ({
    id: s.id,
    full_name: s.full_name,
    headline: s.headline,
    avatar_url: s.avatar_url,
    detail: s.employer,
  }));

  // A target in the query string (from a profile's "Ask for an intro"
  // button, a target-list row, or the roster-suggestion "Claim" flow)
  // asks for a path to that person -- this used to be the separate
  // /app/find page.
  let target: { id: string; full_name: string } | null = null;
  let brokers: Broker[] = [];
  let pathSuggestions: DetailSuggestion[] = [];
  const hasTarget = typeof targetId === "string" && targetId.length > 0;

  if (hasTarget) {
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", targetId)
      .is("deleted_at", null)
      .maybeSingle();
    target = targetProfile;

    if (target) {
      const { data } = await supabase.rpc("find_brokers", { p_target: target.id });
      brokers = (data ?? []) as Broker[];

      await supabase.rpc("log_event", {
        p_name: "find_brokers_run",
        p_props: { broker_count: brokers.length },
      });

      if (brokers.length === 0) {
        pathSuggestions = roster;
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-2xl">
        <h1 className={heading1}>Search</h1>
        <p className={`${mutedText} mt-2`}>
          Find someone by name, employer, or city -- we&apos;ll show you how
          you&apos;re connected, or how to get introduced.
        </p>
        <Link href="/app/companies" className={`${link} mt-2 inline-block text-sm`}>
          Browse by company →
        </Link>

        <div className="mt-6">
          <PersonSearch />
        </div>

        {hasTarget && <PathResults target={target} brokers={brokers} suggestions={pathSuggestions} />}

        <PeopleYouMayKnow roster={roster} employerOverlap={employerOverlap} />
      </div>
    </div>
  );
}
