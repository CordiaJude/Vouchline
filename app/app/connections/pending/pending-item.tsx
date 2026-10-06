"use client";

import { useActionState } from "react";
import { answerPending, declinePending, type AnswerState } from "./actions";
import { CategoryMultiSelect } from "@/app/components/category-multi-select";
import { VisibilityChoice } from "@/app/components/visibility-choice";
import { btnPrimarySmall, btnSecondarySmall } from "@/app/components/ui/styles";

const YEAR_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const STRENGTH_OPTIONS = [
  { value: 1, label: "Acquaintance" },
  { value: 2, label: "Familiar" },
  { value: 3, label: "Solid" },
  { value: 4, label: "Close" },
  { value: 5, label: "Very close" },
];

const initialState: AnswerState = {};

export function PendingItem({
  connectionId,
  name,
}: {
  connectionId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(
    answerPending.bind(null, connectionId),
    initialState,
  );

  return (
    <div className="rounded-card border border-border bg-surface p-5 shadow-card">
      <p className="text-base font-bold text-ink">
        {name}
      </p>

      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <CategoryMultiSelect legendText={`How do you know ${name}?`} />

        <div className="flex gap-3">
          <select
            name="years"
            required
            defaultValue=""
            aria-label="Years known"
            className="h-11 flex-1 rounded-input border border-border-strong bg-surface px-3 text-sm text-ink outline-none focus:border-link focus:ring-4 focus:ring-link/20"
          >
            <option value="" disabled>
              Years…
            </option>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y === 10 ? "10+ yrs" : `${y} yrs`}
              </option>
            ))}
          </select>

          <select
            name="strength"
            required
            defaultValue=""
            aria-label="Closeness"
            className="h-11 flex-1 rounded-input border border-border-strong bg-surface px-3 text-sm text-ink outline-none focus:border-link focus:ring-4 focus:ring-link/20"
          >
            <option value="" disabled>
              Closeness…
            </option>
            {STRENGTH_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <p className="-mt-2 text-xs text-muted">
          Only you will ever see the closeness rating.
        </p>

        <VisibilityChoice name={name.split(" ")[0]} />

        {state.error && (
          <p className="rounded-card bg-danger/10 p-2 text-sm text-danger">
            {state.error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pending}
            className={`${btnPrimarySmall} h-10 flex-1`}
          >
            {pending ? "Saving…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => declinePending(connectionId)}
            className={`${btnSecondarySmall} h-10`}
          >
            Decline
          </button>
        </div>
      </form>
    </div>
  );
}
