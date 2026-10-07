"use client";

import { useActionState, useState } from "react";
import { writeVouch, deleteVouch, type VouchState } from "@/app/app/vouches/actions";
import { btnPrimarySmall, btnSecondarySmall, input } from "@/app/components/ui/styles";

const initial: VouchState = {};

// "Write a vouch" for a confirmed connection. Shows the status of an
// existing one (waiting for their approval / on their profile / hidden).
export function VouchComposer({
  subjectId,
  firstName,
  existing,
}: {
  subjectId: string;
  firstName: string;
  existing: { body: string; status: "pending" | "approved" | "hidden" } | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(writeVouch.bind(null, subjectId), initial);
  const [text, setText] = useState(existing?.body ?? "");

  if (state.saved && !open) {
    return <p className="text-sm text-muted">Sent. It&apos;ll show on {firstName}&apos;s profile once they approve it.</p>;
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(true)} className={btnSecondarySmall}>
          {existing ? "Edit your vouch" : `Vouch for ${firstName}`}
        </button>
        {existing && (
          <span className="text-xs text-muted">
            {existing.status === "pending"
              ? "Waiting for their approval"
              : existing.status === "approved"
                ? "On their profile"
                : "They chose not to show it"}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <form
        action={async (fd) => {
          await action(fd);
          setOpen(false);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="vouch-body" className="text-sm font-semibold text-ink">
          Vouch for {firstName}
        </label>
        <textarea
          id="vouch-body"
          name="body"
          rows={4}
          minLength={20}
          maxLength={500}
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`How do you know ${firstName}, and what are they great at? Be specific.`}
          className={input}
        />
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{firstName} approves it before it shows on their profile.</span>
          <span>{text.trim().length}/500</span>
        </div>
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending || text.trim().length < 20} className={btnPrimarySmall}>
            {pending ? "Sending…" : existing ? "Update vouch" : "Send vouch"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className={btnSecondarySmall}>
            Cancel
          </button>
        </div>
      </form>
      {existing && (
        <form action={deleteVouch} className="mt-3 border-t border-border pt-3">
          <input type="hidden" name="subject_id" value={subjectId} />
          <button type="submit" className="text-xs font-semibold text-danger hover:underline">
            Delete my vouch
          </button>
        </form>
      )}
    </div>
  );
}
