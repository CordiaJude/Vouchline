"use client";

import { useActionState } from "react";
import { ToggleChip } from "@/app/components/toggle-chip";
import { btnPrimarySmall } from "@/app/components/ui/styles";
import { INTEREST_GROUPS, GOALS } from "@/lib/interests";
import { saveInterests, type InterestsState } from "./actions";

const initial: InterestsState = {};

export function InterestsSettings({ interests, goals }: { interests: string[]; goals: string[] }) {
  const [state, action, pending] = useActionState(saveInterests, initial);
  return (
    <form action={action} className="flex flex-col gap-5">
      <p className="text-sm text-muted">Used to suggest people you&apos;ll click with.</p>
      {INTEREST_GROUPS.map((group) => (
        <fieldset key={group.title}>
          <legend className="text-sm font-bold text-ink">{group.title}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {group.items.map((i) => (
              <ToggleChip key={i.value} name="interests" value={i.value} label={i.label} defaultChecked={interests.includes(i.value)} />
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset>
        <legend className="text-sm font-bold text-ink">Goals</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <ToggleChip key={g.value} name="goals" value={g.value} label={g.label} defaultChecked={goals.includes(g.value)} />
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimarySmall}>
          {pending ? "Saving…" : "Save interests"}
        </button>
        {state.saved && <span className="text-xs font-semibold text-success">Saved</span>}
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
