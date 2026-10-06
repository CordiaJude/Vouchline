"use client";

import { useActionState, useState } from "react";
import { REL_TYPES, FORMER_ELIGIBLE } from "@/app/components/rel-types";
import { input, btnPrimary } from "@/app/components/ui/styles";
import { claimPersonAction, claimStubAction, type ClaimState } from "./actions";

const YEAR_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const initialState: ClaimState = {};

function CategoryFields({ category, onCategoryChange }: { category: string; onCategoryChange: (v: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-label text-sm font-medium text-body">
        How do you know them?
      </legend>
      {REL_TYPES.map((rel) => (
        <label key={rel.value} className="flex items-center gap-3 text-sm text-ink">
          <input
            type="radio"
            name="category"
            value={rel.value}
            required
            onChange={() => onCategoryChange(rel.value)}
            className="h-4 w-4"
          />
          {rel.label}
        </label>
      ))}
      {FORMER_ELIGIBLE.has(category) && (
        <label className="ml-7 flex items-center gap-3 text-xs text-body">
          <input type="checkbox" name="is_former" className="h-4 w-4 accent-accent" />
          This is a former {category}
        </label>
      )}
    </fieldset>
  );
}

function YearsAndNote() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="claim-years" className="font-label text-sm font-medium text-body">
          Years known (optional)
        </label>
        <select id="claim-years" name="years" defaultValue="" className={input}>
          <option value="">Not sure</option>
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y === 10 ? "10+" : y}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="claim-note" className="font-label text-sm font-medium text-body">
          Note to yourself (optional, private)
        </label>
        <textarea
          id="claim-note"
          name="note"
          rows={2}
          maxLength={1000}
          placeholder="Only you can see this"
          className={input}
        />
      </div>
    </>
  );
}

export function ClaimPersonForm({ personId, personName }: { personId: string; personName: string }) {
  const [state, formAction, pending] = useActionState(
    claimPersonAction.bind(null, personId),
    initialState,
  );
  const [category, setCategory] = useState("");

  if (state.success) {
    return (
      <p className="rounded-card bg-fill p-4 text-sm text-body">
        Claimed. This is private to you until {personName.split(" ")[0]} confirms it too.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <CategoryFields category={category} onCategoryChange={setCategory} />
      <YearsAndNote />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : `Claim ${personName.split(" ")[0]}`}
      </button>
    </form>
  );
}

export function ClaimStubForm() {
  const [state, formAction, pending] = useActionState(claimStubAction, initialState);
  const [category, setCategory] = useState("");

  if (state.success) {
    return (
      <p className="rounded-card bg-fill p-4 text-sm text-body">
        Claimed. They&apos;re not on Vouchline yet -- if they sign up later with a
        matching LinkedIn, this claim carries over automatically.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="claim-name" className="font-label text-sm font-medium text-body">
          Their name
        </label>
        <input id="claim-name" name="full_name" required className={input} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="claim-linkedin" className="font-label text-sm font-medium text-body">
          LinkedIn URL (optional)
        </label>
        <input
          id="claim-linkedin"
          name="linkedin_url"
          type="url"
          placeholder="https://www.linkedin.com/in/them"
          className={input}
        />
      </div>
      <CategoryFields category={category} onCategoryChange={setCategory} />
      <YearsAndNote />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : "Claim them"}
      </button>
    </form>
  );
}
