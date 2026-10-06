import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/components/empty-state";
import { Avatar } from "@/app/components/avatar";
import { Icon } from "@/app/components/icons";
import { TargetRow } from "@/app/app/targets/target-row";
import { AddTarget } from "@/app/app/targets/add-target";

// Intros: the whole journey to meeting someone, in one place.
//   want  -- your private list of people you want to meet (was Targets)
//   asked -- intros you've requested
//   pass  -- people asking YOU to introduce them
//   you   -- people being introduced TO you

type Person = { id: string; full_name: string; avatar_url: string | null } | null;
type IntroRow = {
  id: string;
  status: string;
  created_at: string;
  ask: string;
  requester: Person;
  broker: Person;
  target: Person;
};
type Target = {
  id: string;
  target_id: string;
  full_name: string;
  headline: string | null;
  is_stub: boolean;
  stage: string;
  note: string | null;
};

const TABS = [
  { key: "want", label: "Want to meet" },
  { key: "asked", label: "Asked" },
  { key: "pass", label: "To pass on" },
  { key: "you", label: "For you" },
] as const;
type Tab = (typeof TABS)[number]["key"];

// Old ?tab= values from before the merge still work.
const LEGACY: Record<string, Tab> = { sent: "asked", broker: "pass", target: "you" };

function parseTab(raw: unknown): Tab {
  if (typeof raw !== "string") return "want";
  if (raw in LEGACY) return LEGACY[raw];
  return (TABS.some((t) => t.key === raw) ? raw : "want") as Tab;
}

function status(s: string, masked: boolean): { label: string; tone: "wait" | "good" | "done" } {
  if (masked && ["declined_broker", "declined_target", "expired"].includes(s)) {
    return { label: "Not available right now", tone: "done" };
  }
  const map: Record<string, { label: string; tone: "wait" | "good" | "done" }> = {
    pending_broker: { label: "Waiting on them to pass it on", tone: "wait" },
    pending_target: { label: "Waiting on a reply", tone: "wait" },
    accepted: { label: "Introduced", tone: "good" },
    declined_broker: { label: "Declined", tone: "done" },
    declined_target: { label: "Declined", tone: "done" },
    expired: { label: "Expired", tone: "done" },
    withdrawn: { label: "Withdrawn", tone: "done" },
  };
  return map[s] ?? { label: s, tone: "done" };
}

const INTRO_COLS =
  "id, status, created_at, ask, requester:profiles!intro_requests_requester_id_fkey(id, full_name, avatar_url), broker:profiles!intro_requests_broker_id_fkey(id, full_name, avatar_url), target:profiles!intro_requests_target_id_fkey(id, full_name, avatar_url)";

export default async function IntrosPage({ searchParams }: PageProps<"/app/intros">) {
  const { tab: rawTab, add: addId } = await searchParams;
  const tab = parseTab(rawTab);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let intros: IntroRow[] = [];
  let targets: Target[] = [];
  let prefill: { id: string; full_name: string } | null = null;

  if (tab === "want") {
    const [{ data }, pre] = await Promise.all([
      supabase.rpc("my_target_list"),
      typeof addId === "string" && addId && addId !== "1"
        ? supabase.from("profiles").select("id, full_name").eq("id", addId).is("deleted_at", null).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    targets = (data ?? []) as Target[];
    prefill = pre.data;
  } else {
    const column = tab === "asked" ? "requester_id" : tab === "pass" ? "broker_id" : "target_id";
    const { data } = await supabase
      .from("intro_requests")
      .select(INTRO_COLS)
      .eq(column, user.id)
      .order("created_at", { ascending: false });
    intros = (data ?? []) as unknown as IntroRow[];
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 md:py-10">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Intros</h1>

      {/* Underline tabs, scrollable on narrow phones */}
      <nav className="-mx-4 mt-4 flex overflow-x-auto border-b border-border px-4" aria-label="Intro sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/app/intros?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 pb-3 pt-1 text-sm font-semibold transition-colors ${
              tab === t.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-body"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "want" ? (
        <>
          <p className="mt-4 text-sm text-muted">
            A private list of people you want to meet. Only you can see it. We&apos;ll look for a path to each one.
          </p>
          <div className="mt-4 rounded-card border border-border bg-surface p-4">
            <AddTarget prefill={prefill} />
          </div>
          {targets.length === 0 ? (
            <EmptyState
              headline="No one on your list yet"
              detail="Add someone you'd like to meet, from Explore or right here."
              cta={{ label: "Explore people", href: "/app/explore" }}
            />
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {targets.map((t) => (
                <TargetRow key={t.id} target={t} />
              ))}
            </ul>
          )}
        </>
      ) : intros.length === 0 ? (
        tab === "asked" ? (
          <EmptyState
            headline="You haven't asked for an intro yet"
            detail="Find someone you want to meet and we'll show you who can introduce you."
            cta={{ label: "Explore people", href: "/app/explore" }}
          />
        ) : tab === "pass" ? (
          <EmptyState
            headline="No one's asked you to pass on an intro"
            detail="When someone wants an intro to one of your connections, it shows up here."
          />
        ) : (
          <EmptyState
            headline="No intros to you yet"
            detail="When someone asks a mutual connection to introduce you, it shows up here."
          />
        )
      ) : (
        <ul className="mt-2 flex flex-col">
          {intros.map((intro) => {
            const st = status(intro.status, tab === "asked");
            // Lead with the person this row is really about.
            const lead = tab === "asked" ? intro.target : intro.requester;
            const line =
              tab === "asked" ? (
                <>
                  <b className="font-semibold">{intro.target?.full_name}</b>
                  <span className="text-muted"> via {intro.broker?.full_name}</span>
                </>
              ) : tab === "pass" ? (
                <>
                  <b className="font-semibold">{intro.requester?.full_name}</b>
                  <span className="text-muted"> → {intro.target?.full_name}</span>
                </>
              ) : (
                <>
                  <b className="font-semibold">{intro.requester?.full_name}</b>
                  <span className="text-muted"> via {intro.broker?.full_name}</span>
                </>
              );
            return (
              <li key={intro.id}>
                <Link
                  href={`/app/intros/${intro.id}`}
                  className="-mx-2 flex items-center gap-3 rounded-input px-2 py-3 hover:bg-fill"
                >
                  {lead ? (
                    <Avatar id={lead.id} name={lead.full_name} src={lead.avatar_url} size={48} />
                  ) : (
                    <span className="h-12 w-12 rounded-full bg-fill" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{line}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          st.tone === "good" ? "bg-success" : st.tone === "wait" ? "bg-link" : "bg-border-strong"
                        }`}
                        aria-hidden="true"
                      />
                      <span className={st.tone === "good" ? "text-success" : "text-muted"}>{st.label}</span>
                    </p>
                  </div>
                  <Icon name="chevronRight" className="h-4 w-4 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
