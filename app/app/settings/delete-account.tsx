"use client";

import { useState } from "react";
import { deleteAccount } from "./actions";

export function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="h-11 rounded-pill border border-danger/30 px-6 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
      >
        Delete my account
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-danger/30 p-4">
      <p className="text-sm text-body">
        This removes your profile, chapter memberships, and connections.
        This can&apos;t be undone.
      </p>
      <div className="flex gap-3">
        <form action={deleteAccount}>
          <button
            type="submit"
            className="h-10 rounded-pill bg-[#A23B3B] px-5 text-sm font-medium text-white transition-colors hover:bg-[#8f3232]"
          >
            Yes, delete my account
          </button>
        </form>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="h-10 rounded-pill border border-border px-5 text-sm font-medium text-ink transition-colors hover:bg-fill"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
