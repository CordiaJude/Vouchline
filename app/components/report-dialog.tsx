"use client";

import { useActionState, useState } from "react";
import { reportContent, type ReportContentState } from "@/app/components/moderation-actions";
import { btnPrimarySmall, btnSecondarySmall, input } from "@/app/components/ui/styles";

const REASONS = [
  "Spam or scam",
  "Harassment or bullying",
  "Hate or discrimination",
  "Sexual or inappropriate content",
  "Pretending to be someone else",
  "False or misleading",
  "Something else",
];

type Target = { kind: "user" | "message" | "vouch"; reportedId?: string; messageId?: string; vouchId?: string };

const initial: ReportContentState = {};

// Modal: why are you reporting this? Reviewed by Vouchline's moderators.
export function ReportDialog({ target, what, onClose }: { target: Target; what: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(reportContent.bind(null, target), initial);
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={`Report ${what}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="sheet-in relative w-full max-w-md rounded-t-[24px] border border-border bg-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))] md:rounded-[24px] md:pb-5">
        {state.done ? (
          <>
            <h2 className="text-base font-bold text-ink">Thanks for letting us know</h2>
            <p className="mt-1 text-sm text-muted">
              Our team will review it. The person won&apos;t know who reported them. You can also block them so they
              can&apos;t contact you.
            </p>
            <button type="button" onClick={onClose} className={`${btnPrimarySmall} mt-4`}>
              Done
            </button>
          </>
        ) : (
          <form action={action} className="flex flex-col gap-3">
            <h2 className="text-base font-bold text-ink">Report {what}</h2>
            <p className="text-sm text-muted">Why are you reporting this? It&apos;s anonymous.</p>
            <div className="flex flex-col">
              {REASONS.map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-3 rounded-input px-2 py-2.5 text-sm text-ink hover:bg-fill">
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="h-4 w-4 accent-[var(--link)]"
                  />
                  {r}
                </label>
              ))}
            </div>
            <textarea name="details" rows={2} maxLength={800} placeholder="Anything else we should know? (optional)" className={input} />
            {state.error && <p className="text-sm text-danger">{state.error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={!reason || pending} className={btnPrimarySmall}>
                {pending ? "Sending…" : "Send report"}
              </button>
              <button type="button" onClick={onClose} className={btnSecondarySmall}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// A small "Report" link that opens the dialog (for server-rendered lists).
export function ReportLink({ target, what, className }: { target: Target; what: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? "text-xs font-semibold text-muted hover:text-ink"}>
        Report
      </button>
      {open && <ReportDialog target={target} what={what} onClose={() => setOpen(false)} />}
    </>
  );
}
