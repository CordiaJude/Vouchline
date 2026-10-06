"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { relLabel } from "@/app/components/rel-types";
import { Avatar } from "@/app/components/avatar";
import {
  cardOutlined,
  pill,
  pillAccent,
  btnPrimarySmall,
  btnSecondarySmall,
  mutedText,
} from "@/app/components/ui/styles";

export type PersonResult = {
  id: string;
  full_name: string;
  headline: string | null;
  employer?: string | null;
  city: string | null;
  relationship_status: "confirmed" | "pending_sent" | "pending_received" | "claimed" | "none";
  category: string | null;
  mutual_count: number;
  is_new?: boolean;
  avatar_url?: string | null;
};

type MutualPerson = { id: string; full_name: string; headline: string | null };

function ActionButton({ result }: { result: PersonResult }) {
  switch (result.relationship_status) {
    case "confirmed":
      return (
        <Link href={`/app/u/${result.id}`} className={btnSecondarySmall}>
          Already connected
        </Link>
      );
    case "pending_sent":
      return (
        <span className={pill} title="Waiting on them to answer">
          Pending
        </span>
      );
    case "pending_received":
      return (
        <Link href="/app/connections/pending" className={btnPrimarySmall}>
          Respond
        </Link>
      );
    case "claimed":
      return (
        <div className="flex shrink-0 flex-col gap-1.5">
          <Link href={`/app/u/${result.id}`} className={btnSecondarySmall}>
            Claimed by you
          </Link>
          <Link
            href={`/app/search?target=${result.id}`}
            className="text-center font-label text-[12px] font-medium text-link"
          >
            Ask for an intro
          </Link>
        </div>
      );
    default:
      return (
        <div className="flex shrink-0 flex-col gap-1.5">
          <Link href={`/app/connect/request?person=${result.id}`} className={btnPrimarySmall}>
            Connect
          </Link>
          <Link
            href={`/app/search?target=${result.id}`}
            className="text-center font-label text-[12px] font-medium text-link"
          >
            Ask for an intro
          </Link>
          <Link
            href={`/app/claim?person=${result.id}`}
            className="text-center font-label text-[12px] font-medium text-link"
          >
            Claim
          </Link>
        </div>
      );
  }
}

// A tap/click-toggled preview rather than pure CSS :hover -- hover alone
// doesn't work on touch, and the spec asks for both. Fetches lazily
// (only once, on first open) so browsing a long result list doesn't fire
// a mutual_connections() call per row up front.
function MutualPreview({ personId, count }: { personId: string; count: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mutuals, setMutuals] = useState<MutualPerson[] | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && mutuals === null) {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase.rpc("mutual_connections", { p_other: personId });
      setMutuals((data ?? []) as MutualPerson[]);
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className={`${pill} cursor-pointer`}
        aria-expanded={open}
      >
        {count} mutual{count === 1 ? "" : "s"}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-card border border-border bg-surface p-2 shadow-lg">
          {loading ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : mutuals && mutuals.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {mutuals.slice(0, 5).map((m) => (
                <li key={m.id} className="truncate text-xs text-body">
                  {m.full_name}
                </li>
              ))}
              {mutuals.length > 5 && (
                <li className="text-xs text-muted">+{mutuals.length - 5} more</li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-muted">No shared connections found.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function PersonResultCard({ result }: { result: PersonResult }) {
  return (
    <li className={`${cardOutlined} flex items-start gap-3`}>
      <Avatar id={result.id} name={result.full_name} src={result.avatar_url} size={40} />
      <div className="min-w-0 flex-1">
        <Link href={`/app/u/${result.id}`} className="text-sm font-medium text-ink">
          {result.full_name}
        </Link>
        {(result.employer || result.city) && (
          <p className={mutedText}>
            {[result.employer, result.city].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {result.category && (
            <span className={pillAccent}>{relLabel(result.category)}</span>
          )}
          {result.is_new && (
            <span className={pill} title="Joined in the last 7 days">
              New here
            </span>
          )}
          {result.mutual_count > 0 && (
            <MutualPreview personId={result.id} count={result.mutual_count} />
          )}
        </div>
      </div>
      <ActionButton result={result} />
    </li>
  );
}
