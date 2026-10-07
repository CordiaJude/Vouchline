"use client";

import { useActionState } from "react";
import { verifyEmail, removeVerification, type VerifyState } from "./verify-actions";
import { btnPrimarySmall, btnSecondarySmall, input } from "@/app/components/ui/styles";
import { Icon } from "@/app/components/icons";

const initial: VerifyState = {};

export function VerifyEmailCard({ kind, verifiedDomain }: { kind: "school" | "work"; verifiedDomain: string | null }) {
  const [state, action, pending] = useActionState(verifyEmail.bind(null, kind), initial);
  const label = kind === "school" ? "School email" : "Work email";
  const domain = state.step === "done" ? state.domain : verifiedDomain;

  return (
    <div className="rounded-input border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="text-xs text-muted">
            {kind === "school" ? "Use your .edu address." : "Use your company address, not Gmail or Outlook."} Only the
            domain shows on your profile.
          </p>
        </div>
        {domain && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-link/15 px-2.5 py-1 text-xs font-semibold text-link">
            <Icon name="check" className="h-3.5 w-3.5" /> {domain}
          </span>
        )}
      </div>

      {domain && state.step !== "code" ? (
        <form action={removeVerification} className="mt-3">
          <input type="hidden" name="kind" value={kind} />
          <button type="submit" className="text-xs font-semibold text-muted hover:text-ink">
            Remove badge
          </button>
        </form>
      ) : state.step === "code" ? (
        <form action={action} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="intent" value="check" />
          <label htmlFor={`${kind}-code`} className="text-xs text-muted">
            We sent a 6-digit code to <span className="font-semibold text-ink">{state.email}</span>.
          </label>
          <div className="flex gap-2">
            <input
              id={`${kind}-code`}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              required
              className={`${input} max-w-[10rem] text-center text-lg tracking-[0.3em]`}
            />
            <button type="submit" disabled={pending} className={btnPrimarySmall}>
              {pending ? "Checking…" : "Verify"}
            </button>
          </div>
          {state.error && <p className="text-sm text-danger">{state.error}</p>}
        </form>
      ) : (
        <form action={action} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor={`${kind}-email`} className="sr-only">
            {label}
          </label>
          <input
            id={`${kind}-email`}
            name="email"
            type="email"
            required
            placeholder={kind === "school" ? "you@school.edu" : "you@company.com"}
            className={input}
          />
          <button type="submit" disabled={pending} className={`${btnSecondarySmall} h-12 shrink-0`}>
            {pending ? "Sending…" : "Send code"}
          </button>
          {state.error && <p className="text-sm text-danger sm:hidden">{state.error}</p>}
        </form>
      )}
      {state.error && state.step !== "code" && <p className="mt-2 hidden text-sm text-danger sm:block">{state.error}</p>}
    </div>
  );
}
