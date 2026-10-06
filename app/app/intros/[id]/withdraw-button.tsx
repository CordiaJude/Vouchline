"use client";

import { useTransition } from "react";
import { withdrawIntro } from "./actions";

export function WithdrawButton({ introId }: { introId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => withdrawIntro(introId))}
      className="h-11 rounded-pill border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-fill disabled:opacity-60"
    >
      Withdraw request
    </button>
  );
}
