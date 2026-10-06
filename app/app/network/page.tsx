import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REL_TYPES } from "@/app/components/rel-types";
import { CategoryList } from "@/app/components/category-list";
import { setConnectionVisibility } from "./actions";
import type { ContactRow } from "@/app/components/contact-request-row";
import { NetworkOrb } from "./network-orb";
import {
  buildCommunityGraph,
  relColor,
  ME_COLOR,
  type PublicGraphEdge,
} from "@/lib/community-graph";
import { Avatar } from "@/app/components/avatar";
import {
  heading1,
  mutedText,
  cardOutlined,
  link as linkStyle,
  chip,
  chipActive,
  segmented,
  segment,
  segmentActive,
} from "@/app/components/ui/styles";

type MyCategoryEntry = {
  category: string;
  is_former: boolean;
  is_primary: boolean;
  confirmed: boolean;
};

type MyConnection = {
  other_id: string;
  full_name: string;
  eff_type: string | null;
  eff_years: number | null;
  eff_is_former: boolean;
  my_categories: MyCategoryEntry[];
  my_years: number;
  my_strength: number;
  status: string;
  confirmed_at: string | null;
  avatar_url: string | null;
};

export default async function NetworkPage({
  searchParams,
}: PageProps<"/app/network">) {
  const { type: typeFilter, view, sort, scope } = await searchParams;
  const isOrbView = view === "orb";
  const isCommunity = isOrbView && scope === "everyone";
  const isRecentSort = sort === "recent";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data }, { data: myProfile }, { data: graphData }, { data: visData }, { data: contactData }] =
    await Promise.all([
    supabase.rpc("my_connections"),
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle(),
    isCommunity ? supabase.rpc("public_graph") : Promise.resolve({ data: null }),
    isOrbView ? Promise.resolve({ data: null }) : supabase.rpc("my_connection_visibility"),
    isOrbView ? Promise.resolve({ data: null }) : supabase.rpc("my_contacts"),
  ]);
  const contacts = ((contactData ?? []) as ContactRow[]).filter((c) => c.status === "accepted");
  // other_id -> { connection id, my own public/private choice }
  const visibility = new Map(
    ((visData ?? []) as { connection_id: string; other_id: string; my_public: boolean }[]).map(
      (v) => [v.other_id, v],
    ),
  );
  let connections = ((data ?? []) as MyConnection[]).filter(
    (c) => c.status === "confirmed",
  );

  // Only offer filter chips for categories the user actually has at
  // least one confirmed connection in -- with all 10 taxonomy
  // categories always shown, most people saw 7-8 chips that could only
  // ever return zero results, which is exactly the clutter the audit
  // flagged.
  let publicEdges = (graphData ?? []) as PublicGraphEdge[];
  const presentTypes = REL_TYPES.filter((t) =>
    isCommunity
      ? publicEdges.some((e) => e.shared_type === t.value)
      : connections.some((c) => c.eff_type === t.value),
  );

  if (typeof typeFilter === "string" && typeFilter) {
    connections = connections.filter((c) => c.eff_type === typeFilter);
    publicEdges = publicEdges.filter((e) => e.shared_type === typeFilter);
  }

  const communityGraph = isCommunity ? buildCommunityGraph(publicEdges, user.id) : null;

  connections = isRecentSort
    ? [...connections].sort(
        (a, b) => new Date(b.confirmed_at ?? 0).getTime() - new Date(a.confirmed_at ?? 0).getTime(),
      )
    : [...connections].sort((a, b) => a.full_name.localeCompare(b.full_name));

  const href = (overrides: {
    view?: string;
    scope?: string;
    type?: string;
    sort?: string;
  }) => {
    const pick = (k: keyof typeof overrides, cur: unknown) => {
      const v = k in overrides ? overrides[k] : cur;
      return typeof v === "string" ? v : "";
    };
    const nextView = pick("view", view);
    const params = new URLSearchParams();
    if (nextView === "orb") {
      params.set("view", "orb");
      const nextScope = pick("scope", scope);
      if (nextScope === "everyone") params.set("scope", "everyone");
    }
    const nextType = pick("type", typeFilter);
    if (nextType) params.set("type", nextType);
    const nextSort = pick("sort", sort);
    if (nextSort && nextView !== "orb") params.set("sort", nextSort);
    const s = params.toString();
    return s ? `/app/network?${s}` : "/app/network";
  };

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className={`w-full max-w-sm ${isCommunity ? "md:max-w-3xl" : "md:max-w-xl"}`}>
        <div className="flex items-center justify-between">
          <h1 className={heading1}>My network</h1>
          <div className={segmented}>
            <ViewToggle href={href({ view: "", scope: "" })} active={!isOrbView} label="List" />
            <ViewToggle href={href({ view: "orb" })} active={isOrbView} label="Orb" />
          </div>
        </div>

        {isOrbView && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className={segmented}>
              <ViewToggle
                href={href({ scope: "", type: "" })}
                active={!isCommunity}
                label="My connections"
              />
              <ViewToggle
                href={href({ scope: "everyone", type: "" })}
                active={isCommunity}
                label="Extended network"
              />
            </div>
            {isCommunity && (
              <p className="text-xs text-muted">
                Your connections, their public connections, and theirs, out to 6 steps.
                Private connections only show to the two people in them.
              </p>
            )}
          </div>
        )}

        {presentTypes.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <FilterChip href={href({ type: "" })} active={!typeFilter} label="All" />
            {presentTypes.map((t) => (
              <FilterChip
                key={t.value}
                href={href({ type: t.value })}
                active={typeFilter === t.value}
                label={t.label}
                color={t.color}
              />
            ))}
          </div>
        )}

        {!isOrbView && connections.length > 0 && (
          <div className="mt-3 flex items-center gap-2 font-label text-xs text-muted">
            Sort:
            <Link
              href={href({ sort: "" })}
              className={!isRecentSort ? "font-semibold text-ink" : "underline underline-offset-2"}
            >
              Name
            </Link>
            <Link
              href={href({ sort: "recent" })}
              className={isRecentSort ? "font-semibold text-ink" : "underline underline-offset-2"}
            >
              Recently active
            </Link>
          </div>
        )}

        {isCommunity ? (
          communityGraph && communityGraph.links.length > 0 ? (
            <NetworkOrb mode="community" nodes={communityGraph.nodes} links={communityGraph.links} />
          ) : (
            <p className={`${mutedText} mt-6`}>
              {typeFilter
                ? "No public connections of that type yet."
                : "Nothing to show yet. Connections appear here once both people mark them Public."}
            </p>
          )
        ) : connections.length === 0 ? (
          <p className={`${mutedText} mt-6`}>
            {typeFilter ? (
              "No connections of that type yet."
            ) : (
              <>
                No confirmed connections yet.{" "}
                <Link href="/app/connect" className={linkStyle}>
                  Connect with someone
                </Link>
                .
              </>
            )}
          </p>
        ) : isOrbView ? (
          <NetworkOrb
            mode="mine"
            nodes={[
              {
                id: "me",
                label: myProfile?.full_name ?? "You",
                color: ME_COLOR,
                isMe: true,
                avatarUrl: myProfile?.avatar_url ?? null,
              },
              ...connections.map((c) => ({
                id: c.other_id,
                label: c.full_name,
                color: relColor(c.eff_type),
                isMe: false,
                avatarUrl: c.avatar_url ?? null,
              })),
            ]}
            links={connections.map((c) => ({
              source: "me",
              target: c.other_id,
              color: relColor(c.eff_type),
              isFormer: c.eff_is_former,
              strength: c.my_strength,
            }))}
          />
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {connections.map((c) => (
              <li key={c.other_id} className={`${cardOutlined} flex items-start gap-3`}>
                <Avatar id={c.other_id} name={c.full_name} src={c.avatar_url} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/app/u/${c.other_id}`}
                      className="text-base font-medium text-ink underline-offset-2 hover:underline"
                    >
                      {c.full_name}
                    </Link>
                    {/* Private to you: never shown on their profile or
                        to anyone else, and never rendered as a number. */}
                    <span
                      className="shrink-0 font-label text-xs text-muted"
                      title="Your closeness rating -- only you can see this"
                    >
                      {closenessDots(c.my_strength)}
                    </span>
                  </div>
                  {visibility.get(c.other_id) && (
                    <VisibilityToggle
                      connectionId={visibility.get(c.other_id)!.connection_id}
                      isPublic={visibility.get(c.other_id)!.my_public}
                    />
                  )}
                  <div className="mt-1">
                    <CategoryList
                      categories={c.my_categories}
                      years={c.eff_years === 10 ? "10+ yrs known" : `${c.eff_years} yrs known`}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!isOrbView && contacts.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-bold tracking-tight text-ink">Contacts</h2>
            <p className="mt-1 text-sm text-muted">
              People you&apos;ve added but haven&apos;t confirmed a relationship with. They don&apos;t
              count toward intro paths until you both confirm a connection.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {contacts.map((c) => (
                <li key={c.request_id} className="flex items-center gap-3 rounded-card border border-border bg-surface p-3">
                  <Avatar id={c.other_id} name={c.full_name} src={c.avatar_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/u/${c.other_id}`} className="block truncate text-sm font-bold text-ink hover:underline">
                      {c.full_name}
                    </Link>
                    {c.headline && <p className="truncate text-xs text-muted">{c.headline}</p>}
                  </div>
                  <Link href={`/app/connect/request?person=${c.other_id}`} className="text-xs font-semibold text-link hover:underline">
                    Confirm connection
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function ViewToggle({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={
        active ? segmentActive : segment
      }
      aria-current={active ? "true" : undefined}
    >
      {label}
    </Link>
  );
}

function VisibilityToggle({ connectionId, isPublic }: { connectionId: string; isPublic: boolean }) {
  return (
    <form action={setConnectionVisibility} className="mt-1">
      <input type="hidden" name="connection_id" value={connectionId} />
      <input type="hidden" name="public" value={isPublic ? "false" : "true"} />
      <button
        type="submit"
        title={
          isPublic
            ? "You marked this Public. It shows in the orb if they did too. Tap to make it private."
            : "Only the two of you can see this connection. Tap to make it public."
        }
        className={
          isPublic
            ? "inline-flex h-7 items-center gap-1 rounded-pill bg-accent-soft px-2.5 font-label text-xs font-semibold text-link"
            : "inline-flex h-7 items-center gap-1 rounded-pill bg-fill px-2.5 font-label text-xs font-semibold text-muted"
        }
      >
        {isPublic ? "Public" : "Private"}
      </button>
    </form>
  );
}

function closenessDots(strength: number): string {
  return "●".repeat(strength) + "○".repeat(5 - strength);
}

function FilterChip({
  href,
  active,
  label,
  color,
}: {
  href: string;
  active: boolean;
  label: string;
  // Doubles as the orb's color legend: the swatch matches that type's
  // line/node color.
  color?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={
        active ? chipActive : chip
      }
    >
      {color && (
        <svg width="8" height="8" aria-hidden="true">
          <circle cx="4" cy="4" r="4" fill={color} />
        </svg>
      )}
      {label}
    </Link>
  );
}
