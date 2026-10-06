"use client";

import { useTransition } from "react";
import { respondAsTarget } from "./actions";

export function RespondTargetButtons({ introId }: { introId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => respondAsTarget(introId, true))}
        className="h-11 flex-1 rounded-pill bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        Accept
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => respondAsTarget(introId, false))}
        className="h-11 flex-1 rounded-pill border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-fill disabled:opacity-60"
      >
        Decline
      </button>
    </div>
  );
}
