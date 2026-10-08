"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { input, btnPrimary } from "@/app/components/ui/styles";
import { CategoryMultiSelect } from "@/app/components/category-multi-select";
import { VisibilityChoice } from "@/app/components/visibility-choice";
import { requestConnectionAction, type RequestConnectState } from "./actions";

const YEAR_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const STRENGTH_OPTIONS = [
  { value: 1, label: "Acquaintance" },
  { value: 2, label: "Familiar" },
  { value: 3, label: "Solid" },
  { value: 4, label: "Close" },
  { value: 5, label: "Very close" },
];

const initialState: RequestConnectState = {};

export function RequestConnectionForm({
  personId,
  personName,
}: {
  personId: string;
  personName: string;
}) {
  const [state, formAction, pending] = useActionState(
    requestConnectionAction.bind(null, personId),
    initialState,
  );

  // Submit through onSubmit (not action=) so React doesn't clear the form
  // when the request fails -- the person keeps their answers and can retry.
  function keepValuesSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  if (state.success) {
    return (
      <p className="rounded-card bg-fill p-4 text-sm text-body">
        Sent. This becomes a confirmed connection once {personName.split(" ")[0]}{" "}
        answers too.
      </p>
    );
  }

  return (
    <form onSubmit={keepValuesSubmit} className="flex flex-col gap-4">
      <CategoryMultiSelect legendText={`How do you know ${personName}?`} />

      <div className="flex flex-col gap-1">
        <label htmlFor="request-years" className="font-label text-sm font-medium text-body">
          Years known
        </label>
        <select id="request-years" name="years" required defaultValue="" className={input}>
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
        <label htmlFor="request-strength" className="font-label text-sm font-medium text-body">
          How close are you?
        </label>
        <select id="request-strength" name="strength" required defaultValue="" className={input}>
          <option value="" disabled>
            Select…
          </option>
          {STRENGTH_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">Only you will ever see this rating.</p>
      </div>

      <VisibilityChoice name={personName.split(" ")[0]} />

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Sending…" : `Send request to ${personName.split(" ")[0]}`}
      </button>
    </form>
  );
}
