import Link from "next/link";
import { openDirectChat } from "@/app/app/messages/actions";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BlockButton } from "./block-button";
import { ReportForm } from "@/app/components/report-form";
import { ProfileAbout } from "@/app/components/profile-about";
import { ProfileTabs } from "@/app/components/profile-tabs";
import { relLabel } from "@/app/components/rel-types";
import { CategoryList } from "@/app/components/category-list";
import { Avatar } from "@/app/components/avatar";
import {
  heading1,
  mutedText,
  pill,
  cardOutlined,
  btnPrimary,
  btnSecondary,
} from "@/app/components/ui/styles";

type HowConnectedCategory = {
  category: string;
  is_former: boolean;
  is_primary: boolean;
  confirmed: boolean;
};

type HowConnected = {
  kind: string | null;
  relationship_status: "confirmed" | "pending_sent" | "pending_received" | "claimed" | "none";
  categories: HowConnectedCategory[];
  years: number | null;
  mutual_count: number;
};

type MutualPerson = { id: string; full_name: string; headline: string | null; avatar_url?: string | null };

export default async function OtherProfilePage({
  params,
  searchParams,
}: PageProps<"/app/u/[id]">) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = tab === "connections" ? "connections" : "about";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (id === user.id) {
    redirect("/app/me");
  }

  // RLS (profiles_select) already scopes this to a profile visible to the
  // caller; anything else comes back empty, treated the same as "doesn't
  // exist" rather than leaking which case it was.
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, full_name, headline, grad_year, pledge_class, employer, city, linkedin_url, avatar_url, job_title, industry, school_name, major, status",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  const [{ data: blockRow }, { data: stripResult }, mutualResult] = await Promise.all([
    supabase
      .from("blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", profile.id)
      .maybeSingle(),
    supabase.rpc("how_connected", { p_other: profile.id }).single(),
    activeTab === "connections"
      ? supabase.rpc("mutual_connections", { p_other: profile.id })
      : Promise.resolve({ data: [] as MutualPerson[] }),
  ]);

  const isBlocked = !!blockRow;
  const strip = stripResult as HowConnected | null;
  const mutualList = (mutualResult.data ?? []) as MutualPerson[];

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-2xl">
        <div className="flex items-start gap-3">
          <Avatar id={profile.id} name={profile.full_name} src={profile.avatar_url} size={96} />
          <div>
            <h1 className={heading1}>{profile.full_name}</h1>
            {profile.headline && <p className={`${mutedText} mt-1`}>{profile.headline}</p>}
          </div>
        </div>

        {strip?.kind === "confirmed" && strip.categories.length > 0 && (
          <div className="mt-4">
            <CategoryList categories={strip.categories} />
            {strip.years != null && (
              <p className={`${mutedText} mt-1`}>
                {strip.years === 10 ? "10+" : strip.years} years known
              </p>
            )}
          </div>
        )}
        {strip?.kind === "claimed" && strip.categories.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={pill}>
              {relLabel(strip.categories[0].category, strip.categories[0].is_former)}
              {strip.years != null &&
                ` · ${strip.years === 10 ? "10+" : strip.years} yrs`}
            </span>
            <span className="font-label text-[12px] uppercase tracking-wide text-muted">
              Claimed by you
            </span>
          </div>
        )}
        {strip && strip.mutual_count > 0 && (
          <p className={`${mutedText} mt-2`}>
            {strip.mutual_count} mutual connection{strip.mutual_count === 1 ? "" : "s"}
          </p>
        )}
        {/* Primary actions -- the audit's top finding was that Connect
            and Request intro were buried or missing entirely on other
            people's profiles. This is the first thing below the header,
            driven by the real relationship status rather than just
            confirmed/claimed/null. */}
        {strip && strip.relationship_status !== "confirmed" && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {strip.relationship_status === "pending_sent" && (
              <span className={pill} title="Waiting on them to answer">
                Pending
              </span>
            )}
            {strip.relationship_status === "pending_received" && (
              <Link href="/app/connections/pending" className={btnPrimary}>
                Respond
              </Link>
            )}
            {(strip.relationship_status === "none" || strip.relationship_status === "claimed") && (
              <>
                <Link href={`/app/connect/request?person=${profile.id}`} className={btnPrimary}>
                  Connect
                </Link>
                <Link href={`/app/search?target=${profile.id}`} className={btnSecondary}>
                  Ask for an intro
                </Link>
              </>
            )}
          </div>
        )}

        {strip?.relationship_status === "confirmed" && (
          <form action={openDirectChat} className="mt-4">
            <input type="hidden" name="person_id" value={profile.id} />
            <button type="submit" className={btnPrimary}>
              Message
            </button>
          </form>
        )}

        {strip?.kind !== "confirmed" && (
          <Link
            href={`/app/claim?person=${profile.id}`}
            className="mt-3 inline-block font-label text-sm font-medium text-link"
          >
            {strip?.kind === "claimed" ? "Claim another relationship" : "Claim a relationship"} →
          </Link>
        )}

        <ProfileTabs
          basePath={`/app/u/${profile.id}`}
          active={activeTab}
          connectionsLabel="Mutual"
        />

        <div className="mt-6">
          {activeTab === "about" ? (
            <ProfileAbout profile={profile} />
          ) : mutualList.length === 0 ? (
            <p className={mutedText}>No mutual connections yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {mutualList.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/app/u/${m.id}`}
                    className={`${cardOutlined} flex items-center gap-3`}
                  >
                    <Avatar id={m.id} name={m.full_name} src={m.avatar_url} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{m.full_name}</p>
                      {m.headline && <p className="text-xs text-muted">{m.headline}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6">
          <Link
            href={`/app/intros?tab=want&add=${profile.id}`}
            className="font-label text-sm font-medium text-link"
          >
            Add to targets →
          </Link>
          <div className="flex gap-2">
            <BlockButton targetId={profile.id} initiallyBlocked={isBlocked} />
          </div>
          <ReportForm reportedId={profile.id} />
        </div>
      </div>
    </div>
  );
}
