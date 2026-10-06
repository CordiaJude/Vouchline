"use client";

import { useTransition } from "react";
import { blockUser, unblockUser } from "@/app/components/moderation-actions";

export function BlockButton({
  targetId,
  initiallyBlocked,
}: {
  targetId: string;
  initiallyBlocked: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() =>
          initiallyBlocked
            ? unblockUser(targetId, `/app/u/${targetId}`)
            : blockUser(targetId, `/app/u/${targetId}`),
        )
      }
      className="h-9 rounded-pill border border-danger/30 px-3 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
    >
      {initiallyBlocked ? "Unblock" : "Block"}
    </button>
  );
}
