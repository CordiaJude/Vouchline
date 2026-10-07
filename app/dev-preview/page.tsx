import Link from "next/link";
import { notFound } from "next/navigation";
import { AppNav } from "@/app/components/app-nav";
import { Icon } from "@/app/components/icons";
import { Avatar } from "@/app/components/avatar";
import { VisibilityChoice } from "@/app/components/visibility-choice";
import { SuggestedPersonCard } from "@/app/components/suggested-person-card";
import { OnboardingForm } from "@/app/onboarding/onboarding-form";
import { ChatThread } from "@/app/app/messages/[id]/chat-thread";
import { REL_TYPES } from "@/app/components/rel-types";
import { NetworkOrb, type OrbLinkInput, type OrbNodeInput } from "@/app/app/network/network-orb";
import {
  heading2,
  mutedText,
  btnPrimary,
  btnSecondary,
  btnPrimarySmall,
  btnSecondarySmall,
  btnDangerSmall,
  pill,
  pillAccent,
  pillGold,
  cardOutlined,
  input,
  chip,
  chipActive,
  segmented,
  segment,
  segmentActive,
} from "@/app/components/ui/styles";

// Development-only design gallery: the signed-in shell and components
// rendered with made-up people, so the redesign can be reviewed without
// a Supabase project. Never served in production.
export const dynamic = "force-dynamic";

// Sample chat timestamps, fixed when the module loads (not during render).
const LOADED_AT = Date.now();
const minutesAgo = (m: number) => new Date(LOADED_AT - m * 60000).toISOString();

const PEOPLE = [
  "Maya Chen", "Jordan Ellis", "Priya Raman", "Sam Okafor", "Lena Fischer",
  "Diego Alvarez", "Ava Thompson", "Noah Kim", "Zara Malik", "Ethan Brooks",
  "Chloe Martin", "Omar Haddad", "Grace Liu", "Leo Rossi", "Nina Petrova",
  "Ben Carter", "Ivy Nguyen", "Marcus Reed",
].map((name, i) => ({ id: `p${i}`, name }));

function sampleGraph(): { nodes: OrbNodeInput[]; links: OrbLinkInput[] } {
  const types = REL_TYPES.map((t) => t.color);
  const mine = new Set(["p0", "p1", "p2", "p3", "p4"]);
  const nodes: OrbNodeInput[] = [
    { id: "me", label: "You", color: "var(--accent)", isMe: true, avatarUrl: null },
    ...PEOPLE.map((p) => ({
      id: p.id,
      label: p.name,
      color: mine.has(p.id) ? "#4CB5F9" : "#737373",
      isMe: false,
      isMine: mine.has(p.id),
      avatarUrl: null,
    })),
  ];
  const pairs: [string, string][] = [
    ["me", "p0"], ["me", "p1"], ["me", "p2"], ["me", "p3"], ["me", "p4"],
    ["p0", "p5"], ["p0", "p6"], ["p1", "p7"], ["p1", "p8"], ["p2", "p9"],
    ["p3", "p10"], ["p3", "p11"], ["p4", "p12"], ["p5", "p13"], ["p7", "p14"],
    ["p9", "p15"], ["p11", "p16"], ["p12", "p17"], ["p6", "p8"], ["p13", "p14"],
  ];
  return {
    nodes,
    links: pairs.map(([a, b], i) => ({
      source: a,
      target: b,
      color: types[i % types.length],
      isFormer: i % 7 === 6,
    })),
  };
}

export default function DevPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const graph = sampleGraph();

  return (
    <div className="min-h-screen">
      <AppNav adminOrgId="demo" unreadNotifications={3} me={{ id: "me", name: "Jordan Bullard", avatarUrl: null }} />
      <div className="pb-20 pt-14 md:pb-0 md:pl-[72px] md:pt-0 xl:pl-[244px]">
      <div className="mx-auto w-full max-w-[600px] px-4 py-4 md:py-8">
          <main className="flex min-w-0 flex-col gap-8">
            <section className="-mx-4 border-b border-border pb-4 md:mx-0 md:border-none">
              <ul className="flex gap-4 overflow-x-auto px-4 md:px-0">
                {PEOPLE.slice(0, 9).map((p) => (
                  <li key={p.id} className="w-[72px] shrink-0">
                    <div className="flex flex-col items-center gap-1.5 text-center">
                      <span className="ring-brand-gradient p-[2.5px]">
                        <span className="block rounded-full bg-page p-[2.5px]">
                          <Avatar id={p.id} name={p.name} size={56} />
                        </span>
                      </span>
                      <span className="w-full truncate text-xs text-ink">{p.name.split(" ")[0]}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="flex items-center gap-2 text-base font-bold text-ink">
                Needs you
                <span className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent-gold px-1.5 text-[11px] font-bold text-white">3</span>
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {[
                  ["p0", <><b className="font-bold">Maya Chen</b> wants you to introduce them to <b className="font-bold">Leo Rossi</b></>, "Hoping to talk about product roles at Fable.", "Review"],
                  ["p7", <><b className="font-bold">Sam Okafor</b> wants to introduce you to <b className="font-bold">Noah Kim</b></>, "Noah is hiring a founding designer.", "Review"],
                  ["", <>Confirm how you know <b className="font-bold">Priya Raman</b></>, "They added you. Confirm to make the connection count.", "Confirm"],
                ].map(([id, title, detail, cta], i) => (
                  <li key={i} className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
                    {id ? (
                      <Avatar id={id as string} name="Maya Chen" size={48} />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-fill text-ink">
                        <Icon name="userPlus" className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">{title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted">{detail as string}</p>
                    </div>
                    <span className={btnPrimarySmall}>{cta as string}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className={heading2}>Suggested for you</h2>
              <ul className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
                {PEOPLE.slice(8, 14).map((p, i) => (
                  <li key={p.id} className="w-44 shrink-0">
                    <SuggestedPersonCard
                      person={{
                        id: `s${p.id}`,
                        full_name: p.name,
                        avatar_url: null,
                        headline: ["Founder at Lumen", "Analyst at Ridgeway", "Nurse at St. Mary's", "Realtor", "Designer at Fable", "Sales at Northwind"][i],
                        employer: null,
                        city: null,
                        shared_interests: [],
                        shared_goals: [],
                        mutual_count: i,
                        reasons: [["Startups", "Golf"], ["Investing"], [], ["Real estate", "Fitness"], ["Design", "Travel", "Music"], ["Sales"]][i],
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>

            <section className={cardOutlined}>
              <h2 className={heading2}>Extended network</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className={segmented}>
                  <span className={segment}>My connections</span>
                  <span className={segmentActive}>Extended network</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={chipActive}>All</span>
                {REL_TYPES.slice(0, 6).map((t) => (
                  <span key={t.value} className={chip}>
                    <svg width="8" height="8" aria-hidden="true">
                      <circle cx="4" cy="4" r="4" fill={t.color} />
                    </svg>
                    {t.label}
                  </span>
                ))}
              </div>
              <NetworkOrb mode="community" nodes={graph.nodes} links={graph.links} />
            </section>

            <section className={cardOutlined}>
              <h2 className={heading2}>Activity</h2>
              <ul className="mt-2 flex flex-col divide-y divide-border">
                {[
                  ["p0", "You connected with Maya Chen", "2h"],
                  ["p7", "You're introduced to Noah Kim", "1d"],
                  ["p12", "Grace Liu joined your org", "3d"],
                ].map(([id, text, t]) => (
                  <li key={id} className="flex items-center gap-3 py-3">
                    <Avatar id={id} name={text.replace(/^.* (\w+ \w+)$/, "$1")} size={40} />
                    <div>
                      <p className="text-sm text-body">{text}</p>
                      <p className="text-xs text-muted">{t}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className={cardOutlined}>
              <h2 className={heading2}>Connect with Maya</h2>
              <p className={`${mutedText} mt-1`}>The new question asked whenever you connect.</p>
              <div className="mt-4 flex flex-col gap-4">
                <input className={input} placeholder="How do you know them?" />
                <VisibilityChoice name="Maya" />
                <span className={`${btnPrimary} w-full`}>Confirm connection</span>
              </div>
            </section>

            <section className="overflow-hidden rounded-card border border-border">
              <div className="flex h-[560px] flex-col">
                <ChatThread
                  conversationId="preview"
                  kind="intro"
                  introId="preview"
                  me={{ id: "me", full_name: "Jordan Bullard", avatar_url: null }}
                  others={[
                    { id: "p0", full_name: "Maya Chen", avatar_url: null },
                    { id: "p14", full_name: "Leo Rossi", avatar_url: null },
                  ]}
                  initialMessages={[
                    { id: "1", sender_id: null, body: "Maya Chen introduced Jordan Bullard and Leo Rossi. Say hello!", created_at: minutesAgo(90) },
                    { id: "2", sender_id: "me", body: "Would love to talk about product roles at Fable.", created_at: minutesAgo(89) },
                    { id: "3", sender_id: "p0", body: "Leo, meet Jordan. Best PM I worked with at Northwind. You two should grab coffee.", created_at: minutesAgo(30) },
                    { id: "4", sender_id: "p14", body: "Thanks Maya! Jordan, great to meet you.", created_at: minutesAgo(12) },
                    { id: "5", sender_id: "p14", body: "Free Thursday afternoon?", created_at: minutesAgo(11) },
                    { id: "6", sender_id: "me", body: "Thursday works. 3pm?", created_at: minutesAgo(2) },
                  ]}
                />
              </div>
            </section>

            <section className={cardOutlined}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Onboarding preview</p>
              <OnboardingForm userId="preview" defaultFullName="Jordan Bullard" />
            </section>

            <section className={cardOutlined}>
              <h2 className={heading2}>Components</h2>
              <div className="mt-4 flex flex-wrap gap-3">
                <span className={btnPrimary}>Primary</span>
                <span className={btnSecondary}>Secondary</span>
                <span className={btnPrimarySmall}>Small</span>
                <span className={btnSecondarySmall}>Small secondary</span>
                <span className={btnDangerSmall}>Remove</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={pill}>Path found</span>
                <span className={pillAccent}>Verified</span>
                <span className={pillGold}>New</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {PEOPLE.slice(0, 10).map((p) => (
                  <Avatar key={p.id} id={p.id} name={p.name} size={40} />
                ))}
              </div>
              <p className="mt-4 text-sm">
                <Link href="/" className="font-semibold text-link hover:underline">
                  View landing page
                </Link>
              </p>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
