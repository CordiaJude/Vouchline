"use client";

import { useTransition } from "react";
import { reportOutcome } from "./actions";

export function ReportOutcomeButtons({ introId }: { introId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <p className="text-sm font-medium text-body">
        Did you talk?
      </p>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => reportOutcome(introId, true))}
          className="h-11 flex-1 rounded-pill bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          Yes
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => reportOutcome(introId, false))}
          className="h-11 flex-1 rounded-pill border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-fill disabled:opacity-60"
        >
          No
        </button>
      </div>
    </div>
  );
}
