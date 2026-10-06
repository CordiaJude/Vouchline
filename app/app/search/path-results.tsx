import Link from "next/link";
import { relLabel } from "@/app/components/rel-types";
import { Avatar } from "@/app/components/avatar";
import { pill, pillAccent } from "@/app/components/ui/styles";

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

type RosterSuggestion = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  detail: string | null;
};

export function PathResults({
  target,
  brokers,
  suggestions,
}: {
  target: { id: string; full_name: string } | null;
  brokers: Broker[];
  suggestions: RosterSuggestion[];
}) {
  if (!target) {
    return (
      <p className="mt-8 text-sm text-muted">That person isn&apos;t visible to you.</p>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-medium text-ink">Path to {target.full_name}</h2>

      {brokers.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm text-muted">No verified path yet.</p>
          {suggestions.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-body">
                Connect with alumni from your pledge class or nearby grad years to
                build your network:
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {suggestions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 rounded-card border border-border p-3"
                  >
                    <Link href={`/app/u/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar id={s.id} name={s.full_name} src={s.avatar_url} size={28} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{s.full_name}</p>
                        {s.detail && <p className="text-xs text-muted">{s.detail}</p>}
                      </div>
                    </Link>
                    <Link
                      href={`/app/claim?person=${s.id}`}
                      className="shrink-0 font-label text-xs font-medium text-link"
                    >
                      Claim
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {brokers.map((b) => (
            <li key={b.broker_id} className="rounded-card border border-border p-4">
              <div className="flex items-center gap-3">
                <Avatar id={b.broker_id} name={b.broker_name} src={b.broker_avatar_url} size={40} />
                <div className="min-w-0">
                  <p className="text-base font-medium text-ink">{b.broker_name}</p>
                  {b.broker_headline && (
                    <p className="text-xs text-muted">{b.broker_headline}</p>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={b.bridge_kind === "confirmed" ? pillAccent : pill}>
                  {b.bridge_kind === "confirmed" ? "Confirmed" : "Claimed by you"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">
                You: {relLabel(b.my_rel)} · Them: {relLabel(b.their_rel)}
              </p>
              <Link
                href={`/app/intros/new?target=${target.id}&broker=${b.broker_id}`}
                className="mt-3 inline-flex h-9 items-center rounded-pill bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
              >
                Ask {b.broker_name} for an intro
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
