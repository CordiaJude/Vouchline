"use client";

import { useActionState, useState, useTransition } from "react";
import {
  draftIntroAction,
  requestIntroAction,
  type RequestIntroState,
} from "./actions";

const initialState: RequestIntroState = {};

export function IntroForm({
  targetId,
  targetName,
  brokerId,
  brokerName,
}: {
  targetId: string;
  targetName: string;
  brokerId: string;
  brokerName: string;
}) {
  const [goal, setGoal] = useState("");
  const [ask, setAsk] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [drafting, startDraftTransition] = useTransition();

  const [state, formAction, pending] = useActionState(
    requestIntroAction.bind(null, targetId, brokerId),
    initialState,
  );

  function handleDraft() {
    setDraftError(null);
    startDraftTransition(async () => {
      const result = await draftIntroAction(targetId, brokerName, goal);
      if (result.error) {
        setDraftError(result.error);
      } else if (result.text) {
        setAsk(result.text);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="goal"
          className="text-sm font-medium text-body"
        >
          What are you hoping for? (one line, used only to draft a message —
          never sent to {brokerName} directly)
        </label>
        <input
          id="goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder={`e.g. advice on breaking into ${targetName}'s industry`}
          className="h-12 w-full rounded-input border border-border-strong bg-surface px-4 text-base text-ink outline-none focus:border-link focus:ring-4 focus:ring-link/20"
        />
        <button
          type="button"
          onClick={handleDraft}
          disabled={drafting || !goal.trim()}
          className="mt-2 h-10 w-fit rounded-pill border border-border px-4 text-sm font-medium text-ink transition-colors hover:bg-fill disabled:opacity-60"
        >
          {drafting ? "Drafting…" : "Draft with AI"}
        </button>
        {draftError && (
          <p className="text-sm text-danger">
            {draftError}
          </p>
        )}
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <label
          htmlFor="ask"
          className="text-sm font-medium text-body"
        >
          Message to {brokerName}
        </label>
        <textarea
          id="ask"
          name="ask"
          required
          minLength={20}
          maxLength={1200}
          rows={6}
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder={`Hi ${brokerName}, would you be willing to introduce me to ${targetName}?`}
          className="w-full rounded-input border border-border-strong bg-surface p-4 text-base text-ink outline-none focus:border-link focus:ring-4 focus:ring-link/20"
        />

        {state.error && (
          <p className="rounded-card bg-danger/10 p-3 text-sm text-danger">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="h-12 w-full rounded-pill bg-accent px-6 text-base font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Sending…" : `Ask ${brokerName} for an intro`}
        </button>
      </form>
    </div>
  );
}
