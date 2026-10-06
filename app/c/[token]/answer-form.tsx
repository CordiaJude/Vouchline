"use client";

import { useActionState } from "react";
import { btnPrimary } from "@/app/components/ui/styles";
import { redeemToken, type RedeemState } from "./actions";
import { CategoryMultiSelect } from "@/app/components/category-multi-select";
import { VisibilityChoice } from "@/app/components/visibility-choice";

const YEAR_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const STRENGTH_OPTIONS = [
  { value: 1, label: "Acquaintance" },
  { value: 2, label: "Familiar" },
  { value: 3, label: "Solid" },
  { value: 4, label: "Close" },
  { value: 5, label: "Very close" },
];

const initialState: RedeemState = {};

export function AnswerForm({
  token,
  name,
}: {
  token: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(
    redeemToken.bind(null, token),
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-6">
      <CategoryMultiSelect legendText={`How do you know ${name}?`} />

      <div className="flex flex-col gap-1">
        <label
          htmlFor="years"
          className="text-sm font-medium text-body"
        >
          How many years have you known them?
        </label>
        <select
          id="years"
          name="years"
          required
          defaultValue=""
          className="h-12 w-full rounded-input border border-border-strong bg-surface px-4 text-base text-ink outline-none focus:border-link focus:ring-4 focus:ring-link/20"
        >
          <option value="" disabled>
            Select…
          </option>
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y === 10 ? "10+" : y}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="strength"
          className="text-sm font-medium text-body"
        >
          How close are you?
        </label>
        <select
          id="strength"
          name="strength"
          required
          defaultValue=""
          className="h-12 w-full rounded-input border border-border-strong bg-surface px-4 text-base text-ink outline-none focus:border-link focus:ring-4 focus:ring-link/20"
        >
          <option value="" disabled>
            Select…
          </option>
          {STRENGTH_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">
          Only you will ever see this rating.
        </p>
      </div>

      <VisibilityChoice name={name.split(" ")[0]} />

      {state.error && (
        <p className="rounded-card bg-danger/10 p-3 text-sm text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`${btnPrimary} w-full`}
      >
        {pending ? "Connecting…" : "Confirm connection"}
      </button>
    </form>
  );
}
