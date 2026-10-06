"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Avatar } from "@/app/components/avatar";
import { btnPrimarySmall, btnSecondarySmall } from "@/app/components/ui/styles";
import { sendContactRequest, type ContactState } from "@/app/components/contact-actions";

export type SuggestedPerson = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  headline: string | null;
  employer: string | null;
  city: string | null;
  shared_interests: string[];
  shared_goals: string[];
  mutual_count: number;
  // Already-resolved labels for display (labels live in lib/interests).
  reasons: string[];
};

const initial: ContactState = {};

// One suggestion: who they are, why they're suggested, and two ways in --
// "Add" (a cold contact request) or "I know them" (a real, verified
// connection request).
export function SuggestedPersonCard({ person }: { person: SuggestedPerson }) {
  const [state, action, pending] = useActionState(sendContactRequest.bind(null, person.id), initial);
  const subtitle = person.headline ?? ([person.employer, person.city].filter(Boolean).join(" · ") || null);

  return (
    <div className="flex flex-col items-center rounded-card border border-border bg-surface p-4 text-center">
      <Link href={`/app/u/${person.id}`} className="flex flex-col items-center">
        <span className="ring-brand-gradient p-[2px]">
          <span className="block rounded-full bg-surface p-[2px]">
            <Avatar id={person.id} name={person.full_name} src={person.avatar_url} size={64} />
          </span>
        </span>
        <span className="mt-3 line-clamp-1 text-sm font-bold text-ink">{person.full_name}</span>
      </Link>
      {subtitle && <p className="line-clamp-1 text-xs text-muted">{subtitle}</p>}
      <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs text-body">
        {person.reasons.length > 0
          ? `You both like ${person.reasons.slice(0, 3).join(", ")}`
          : person.mutual_count > 0
            ? `${person.mutual_count} mutual connection${person.mutual_count === 1 ? "" : "s"}`
            : "New to your network"}
      </p>
      <div className="mt-3 flex w-full flex-col gap-2">
        {state.sent ? (
          <span className={`${btnSecondarySmall} w-full`}>Requested</span>
        ) : (
          <form action={action}>
            <button type="submit" disabled={pending} className={`${btnPrimarySmall} w-full`}>
              {pending ? "Adding…" : "Add"}
            </button>
          </form>
        )}
        <Link href={`/app/connect/request?person=${person.id}`} className="text-xs font-semibold text-link hover:underline">
          I know them
        </Link>
      </div>
      {state.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
    </div>
  );
}
