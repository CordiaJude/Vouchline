// Shown when part of a page failed to load, instead of an empty list that
// looks like "nothing here". Pass every query result from the page.
type QueryError = { message?: string; code?: string };

export function loadErrors(...results: unknown[]): string[] {
  return results
    .map((r) => (r && typeof r === "object" && "error" in r ? (r as { error: QueryError | null }).error : null))
    .filter((e): e is QueryError => !!e)
    .map((e) => (e.message?.includes("rate_limited") ? "rate_limited" : `${e.code ?? "error"}: ${e.message ?? "unknown"}`));
}

export function LoadError({ errors, className = "" }: { errors: string[]; className?: string }) {
  if (errors.length === 0) return null;
  const real = errors.filter((e) => e !== "rate_limited");
  return (
    <div role="alert" className={`rounded-card border border-danger/40 bg-danger/10 p-4 text-sm ${className}`}>
      <p className="font-semibold text-danger">
        {real.length === 0 ? "You're going a little fast. Wait a few seconds and refresh." : "Part of this page didn't load."}
      </p>
      {real.length > 0 && (
        <>
          <p className="mt-1 text-body">Try refreshing. If it keeps happening, send this to support:</p>
          <p className="mt-2 break-words font-mono text-xs text-muted">{real.join(" · ")}</p>
        </>
      )}
    </div>
  );
}
