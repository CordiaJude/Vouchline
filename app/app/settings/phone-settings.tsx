"use client";

import { useActionState } from "react";
import { input, btnPrimarySmall } from "@/app/components/ui/styles";
import { savePhone, type PhoneState } from "./phone-actions";

// Your phone number: private, used only so contacts who have it can find you.
export function PhoneSettings({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState<PhoneState, FormData>(savePhone, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="settings-phone" className="text-sm font-semibold text-ink">
        Phone number
      </label>
      <p className="text-xs text-muted">So friends who have your number can find you. Never shown on your profile. Leave blank to remove.</p>
      <div className="flex gap-2">
        <input id="settings-phone" name="phone" type="tel" defaultValue={current ?? ""} placeholder="(214) 555-0123" className={input} />
        <button type="submit" disabled={pending} className={`${btnPrimarySmall} h-auto shrink-0`}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.saved && <p className="text-sm text-muted">Saved.</p>}
    </form>
  );
}
