"use client";

import { useActionState } from "react";
import { createInvite, type InviteState } from "./actions";

const initialState: InviteState = {};

export function InviteForm({ orgId }: { orgId: string }) {
  const [state, formAction, pending] = useActionState(
    createInvite.bind(null, orgId),
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="email"
          name="email"
          placeholder="Email (optional — blank for a shareable link)"
          className="h-10 flex-1 rounded-input border border-border-strong bg-surface px-3 text-sm text-ink outline-none focus:border-link focus:ring-4 focus:ring-link/20"
        />
        <input
          type="number"
          name="max_uses"
          defaultValue={1}
          min={1}
          max={500}
          aria-label="Max uses"
          className="h-10 w-20 rounded-input border border-border-strong bg-surface px-3 text-sm text-ink outline-none focus:border-link focus:ring-4 focus:ring-link/20"
        />
        <input
          type="number"
          name="days"
          defaultValue={14}
          min={1}
          max={365}
          aria-label="Expires in days"
          className="h-10 w-20 rounded-input border border-border-strong bg-surface px-3 text-sm text-ink outline-none focus:border-link focus:ring-4 focus:ring-link/20"
        />
      </div>
      {state.error && (
        <p className="text-sm text-danger">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-link">
          Invite created.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-fit rounded-pill bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create invite"}
      </button>
    </form>
  );
}
