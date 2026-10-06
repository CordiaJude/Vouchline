"use client";

import { useTransition } from "react";
import { removeMember, setMemberRole } from "./actions";
import { Avatar } from "@/app/components/avatar";

type Member = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  email: string;
  role: "admin" | "member";
  status: string;
  joined_at: string;
};

export function MembersTable({
  orgId,
  members,
}: {
  orgId: string;
  members: Member[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 flex flex-col gap-2">
      {members.map((m) => (
        <div
          key={m.user_id}
          className="flex items-center justify-between gap-3 rounded-card border border-border p-3"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Avatar id={m.user_id} name={m.full_name} src={m.avatar_url} size={28} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {m.full_name}
              </p>
              <p className="truncate text-xs text-muted">
                {m.email}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <select
              value={m.role}
              disabled={pending}
              onChange={(e) =>
                startTransition(() =>
                  setMemberRole(
                    orgId,
                    m.user_id,
                    e.target.value as "admin" | "member",
                  ),
                )
              }
              className="h-9 rounded-input border border-border-strong bg-surface px-2 text-xs text-ink"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() => removeMember(orgId, m.user_id))
              }
              className="h-9 rounded-card border border-danger/30 px-2 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
