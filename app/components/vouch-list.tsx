import Link from "next/link";
import { Avatar } from "@/app/components/avatar";
import { relLabel } from "@/app/components/rel-types";
import { ReportLink } from "@/app/components/report-dialog";

export type Vouch = {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  author_headline?: string | null;
  relationship?: string | null;
  body: string;
  updated_at: string;
};

// Approved vouches as quote cards.
export function VouchList({ vouches }: { vouches: Vouch[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {vouches.map((v) => (
        <li key={v.id} className="rounded-card border border-border bg-surface p-4">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">&ldquo;{v.body}&rdquo;</p>
          <div className="mt-3 flex items-center justify-between gap-3">
          <Link href={`/app/u/${v.author_id}`} className="flex min-w-0 items-center gap-2.5">
            <Avatar id={v.author_id} name={v.author_name} src={v.author_avatar_url} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">{v.author_name}</span>
              <span className="block truncate text-xs text-muted">
                {[v.relationship ? relLabel(v.relationship) : null, v.author_headline].filter(Boolean).join(" · ")}
              </span>
            </span>
          </Link>
          <ReportLink target={{ kind: "vouch", vouchId: v.id }} what="this vouch" />
          </div>
        </li>
      ))}
    </ul>
  );
}
