import Link from "next/link";
import { Avatar } from "@/app/components/avatar";
import { cardOutlined, mutedText, btnPrimarySmall } from "@/app/components/ui/styles";

type Suggestion = {
  id: string;
  full_name: string;
  headline: string | null;
  detail: string | null;
  avatar_url: string | null;
};

export function PeopleYouMayKnow({
  roster,
  employerOverlap,
}: {
  roster: Suggestion[];
  employerOverlap: Suggestion[];
}) {
  if (roster.length === 0 && employerOverlap.length === 0) {
    return null;
  }

  return (
    <div className="mt-10 flex flex-col gap-6">
      {roster.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">
            From your roster
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {roster.map((s) => (
              <SuggestionRow key={s.id} suggestion={s} />
            ))}
          </ul>
        </div>
      )}

      {employerOverlap.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">
            Where you work
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {employerOverlap.map((s) => (
              <SuggestionRow key={s.id} suggestion={s} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SuggestionRow({ suggestion }: { suggestion: Suggestion }) {
  return (
    <li className={`${cardOutlined} flex items-center gap-2`}>
      <Link href={`/app/u/${suggestion.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar id={suggestion.id} name={suggestion.full_name} src={suggestion.avatar_url} size={28} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{suggestion.full_name}</p>
          {suggestion.detail && <p className={mutedText}>{suggestion.detail}</p>}
        </div>
      </Link>
      <Link href={`/app/connect/request?person=${suggestion.id}`} className={btnPrimarySmall}>
        Connect
      </Link>
      <Link
        href={`/app/claim?person=${suggestion.id}`}
        className="shrink-0 font-label text-xs font-medium text-link"
      >
        Claim
      </Link>
    </li>
  );
}
