"use client";

import { useTransition } from "react";
import { unblockUser } from "@/app/components/moderation-actions";

export function BlockedList({
  blocked,
}: {
  blocked: { blocked_id: string; full_name: string }[];
}) {
  const [pending, startTransition] = useTransition();

  if (blocked.length === 0) {
    return (
      <p className="text-sm text-muted">
        You haven&apos;t blocked anyone.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {blocked.map((b) => (
        <div
          key={b.blocked_id}
          className="flex items-center justify-between rounded-card border border-border p-3"
        >
          <span className="text-sm text-ink">
            {b.full_name}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => unblockUser(b.blocked_id, "/app/settings"))}
            className="h-8 rounded-pill border border-border px-3 text-xs font-medium text-ink transition-colors hover:bg-fill"
          >
            Unblock
          </button>
        </div>
      ))}
    </div>
  );
}
