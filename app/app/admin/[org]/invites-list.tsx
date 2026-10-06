"use client";

import { useTransition } from "react";
import { resendInvite, revokeInvite } from "./actions";

type Invite = {
  token: string;
  email: string | null;
  full_name: string | null;
  uses: number;
  max_uses: number;
  expires_at: string;
  created_at: string;
};

export function InvitesList({
  orgId,
  invites,
}: {
  orgId: string;
  invites: Invite[];
}) {
  const [pending, startTransition] = useTransition();

  if (invites.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted">
        No pending invites.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {invites.map((inv) => {
        const expired = new Date(inv.expires_at) < new Date();
        const exhausted = inv.uses >= inv.max_uses;
        return (
          <div
            key={inv.token}
            className="flex items-center justify-between gap-3 rounded-card border border-border p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {inv.full_name || inv.email || "Multi-use link"}
              </p>
              <p className="truncate text-xs text-muted">
                {inv.email ?? "no email bound"} · {inv.uses}/{inv.max_uses} used
                {expired ? " · expired" : exhausted ? " · used up" : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {inv.email && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(() => resendInvite(orgId, inv.token))
                  }
                  className="h-9 rounded-card border border-border px-2 text-xs font-medium text-ink transition-colors hover:bg-fill"
                >
                  Resend
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(() => revokeInvite(orgId, inv.token))
                }
                className="h-9 rounded-card border border-danger/30 px-2 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
              >
                Revoke
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
