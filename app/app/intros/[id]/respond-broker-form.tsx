"use client";

import { useTransition } from "react";
import { respondAsBroker } from "./actions";

export function RespondBrokerForm({ introId }: { introId: string }) {
  const [pending, startTransition] = useTransition();

  function submit(accept: boolean, formData: FormData) {
    startTransition(() => {
      respondAsBroker(introId, accept, formData);
    });
  }

  return (
    <form className="flex flex-col gap-3">
      <label
        htmlFor="note"
        className="text-sm font-medium text-body"
      >
        Note (optional, shared with both sides)
      </label>
      <textarea
        id="note"
        name="note"
        rows={3}
        maxLength={500}
        className="w-full rounded-input border border-border-strong bg-surface p-3 text-base text-ink outline-none focus:border-link focus:ring-4 focus:ring-link/20"
      />
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          formAction={(fd) => submit(true, fd)}
          className="h-11 flex-1 rounded-pill bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          Make the intro
        </button>
        <button
          type="submit"
          disabled={pending}
          formAction={(fd) => submit(false, fd)}
          className="h-11 flex-1 rounded-pill border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-fill disabled:opacity-60"
        >
          Decline
        </button>
      </div>
    </form>
  );
}
