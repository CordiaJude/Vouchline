"use client";

import { useState, useTransition } from "react";
import { respondAsBroker, draftBrokerNoteAction } from "./actions";
import { Icon } from "@/app/components/icons";

export function RespondBrokerForm({ introId }: { introId: string }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [drafting, startDraft] = useTransition();
  const [draftError, setDraftError] = useState<string | null>(null);

  function submit(accept: boolean, formData: FormData) {
    startTransition(() => {
      respondAsBroker(introId, accept, formData);
    });
  }

  return (
    <form className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="note" className="text-sm font-medium text-body">
          Note (optional, shared with both sides)
        </label>
        <button
          type="button"
          disabled={drafting}
          onClick={() =>
            startDraft(async () => {
              setDraftError(null);
              const r = await draftBrokerNoteAction(introId);
              if (r.text) setNote(r.text);
              else setDraftError(r.error ?? "Couldn't write a note.");
            })
          }
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-link hover:underline disabled:opacity-50"
        >
          <Icon name="sparkle" className="h-3.5 w-3.5" />
          {drafting ? "Writing…" : "Write it for me"}
        </button>
      </div>
      <textarea
        id="note"
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={500}
        className="w-full rounded-input border border-border-strong bg-surface p-3 text-base text-ink outline-none focus:border-link focus:ring-4 focus:ring-link/20"
      />
      {draftError && <p className="text-sm text-danger">{draftError}</p>}
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
