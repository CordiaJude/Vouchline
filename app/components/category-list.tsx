import { relLabel } from "@/app/components/rel-types";

export type CategoryEntry = {
  category: string;
  is_former: boolean;
  is_primary: boolean;
  confirmed: boolean;
};

// The confirmed/private split, spelled out in plain language instead of
// a bare chip row. There's nothing to "resolve" here -- a category only
// you picked isn't a conflict with what they picked, it's just your own
// note, so the copy never frames it as one ("mismatch", "unconfirmed",
// "vs"). Confirmed categories render together in one line since they're
// the same fact both people agree on; each private-only one gets its
// own line, since each is a separate note only the viewer can see.
export function CategoryList({
  categories,
  years,
}: {
  categories: CategoryEntry[];
  years?: string | null;
}) {
  if (categories.length === 0) return null;

  const confirmed = categories.filter((c) => c.confirmed);
  const privateOnly = categories.filter((c) => !c.confirmed);

  return (
    <div className="flex flex-col gap-1">
      {confirmed.length > 0 && (
        <p className="text-sm text-ink">
          <span className="text-muted">Confirmed together: </span>
          {confirmed
            .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
            .map((c) => relLabel(c.category, c.is_former))
            .join(", ")}
          {years && <span className="text-muted"> · {years}</span>}
        </p>
      )}
      {privateOnly.map((c) => (
        <p key={c.category} className="text-sm text-muted" title="Only you can see this">
          🔒 Just your note: {relLabel(c.category, c.is_former)}
          {years && ` · ${years}`}
        </p>
      ))}
    </div>
  );
}
