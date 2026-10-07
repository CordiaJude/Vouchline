// Shown instantly while a page loads, so a tap responds right away
// instead of the old page sitting frozen until the new one is ready.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[600px] px-4 py-4 md:py-8" aria-busy="true" aria-label="Loading">
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex w-[72px] shrink-0 flex-col items-center gap-2">
            <div className="skeleton h-16 w-16 rounded-full" />
            <div className="skeleton h-3 w-12 rounded-pill" />
          </div>
        ))}
      </div>
      <div className="skeleton mt-8 h-5 w-32 rounded-pill" />
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
            <div className="skeleton h-12 w-12 shrink-0 rounded-full" />
            <div className="flex-1">
              <div className="skeleton h-3.5 w-3/4 rounded-pill" />
              <div className="skeleton mt-2 h-3 w-1/2 rounded-pill" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
