"use client";

import { useActionState, useState } from "react";
import { submitReport, type ReportState } from "./moderation-actions";

const initialState: ReportState = {};

export function ReportForm({
  reportedId,
  introRequestId = null,
  label = "Report",
}: {
  reportedId: string;
  introRequestId?: string | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    submitReport.bind(null, reportedId, introRequestId),
    initialState,
  );

  if (state.success) {
    return (
      <p className="text-sm text-muted">
        Report submitted. Thanks for flagging it.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 rounded-pill border border-border px-3 text-xs font-medium text-body transition-colors hover:bg-fill"
      >
        {label}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <textarea
        name="reason"
        required
        minLength={5}
        maxLength={1000}
        rows={3}
        placeholder="What happened?"
        className="w-full rounded-input border border-border-strong bg-surface p-2 text-sm text-ink outline-none focus:border-link focus:ring-4 focus:ring-link/20"
      />
      {state.error && (
        <p className="text-xs text-danger">{state.error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-8 rounded-pill bg-accent px-3 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Sending…" : "Submit report"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-8 rounded-pill border border-border px-3 text-xs font-medium text-ink transition-colors hover:bg-fill"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
