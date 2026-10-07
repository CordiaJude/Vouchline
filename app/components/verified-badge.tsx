import { Icon } from "@/app/components/icons";

// Blue check + the verified domain(s), e.g. "baylor.edu · deloitte.com".
export function VerifiedBadge({
  school,
  work,
  compact = false,
}: {
  school?: string | null;
  work?: string | null;
  compact?: boolean;
}) {
  const domains = [work, school].filter(Boolean) as string[];
  if (domains.length === 0) return null;
  const title = [work && `Verified work email at ${work}`, school && `Verified school email at ${school}`]
    .filter(Boolean)
    .join(" · ");
  if (compact) {
    return (
      <span title={title} aria-label={title} className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-link text-black">
        <Icon name="check" className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span title={title} className="inline-flex items-center gap-1 text-xs font-semibold text-link">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-link text-black">
        <Icon name="check" className="h-3 w-3" />
      </span>
      Verified · {domains.join(" · ")}
    </span>
  );
}
