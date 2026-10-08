"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/app/components/icons";
import { btnPrimary } from "@/app/components/ui/styles";
import { isStandalone, pushSupported, subscribeToPush } from "@/lib/push-client";

const SNOOZE_KEY = "vl_push_prompt_snoozed_until";
const SNOOZE_DAYS = 7;

function shouldAsk() {
  if (!isStandalone() || !pushSupported()) return false;
  if (Notification.permission !== "default") return false;
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) < Date.now();
  } catch {
    return true;
  }
}

// When Vouchline is opened from the home screen and notifications haven't
// been decided yet, slide up a sheet asking to turn them on. (Phones only
// show the real permission box after a tap, so the sheet's button is what
// triggers it.)
export function NotificationPrompt({ userId }: { userId: string }) {
  const eligible = useSyncExternalStore(
    () => () => {},
    shouldAsk,
    () => false,
  );
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!eligible || closed) return null;

  function snooze() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 864e5));
    } catch {}
    setClosed(true);
  }

  async function allow() {
    setBusy(true);
    setError(null);
    try {
      await subscribeToPush(userId);
      setClosed(true);
    } catch (e) {
      const reason = (e as Error).message;
      if (reason === "denied") {
        setClosed(true); // They said no in the system box; don't nag.
      } else {
        setError(reason === "not_configured" ? "Notifications aren't set up yet." : "Couldn't turn them on. Try again in Settings.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 fade-in md:items-center" role="dialog" aria-modal="true" aria-labelledby="notif-prompt-title">
      <div className="sheet-in w-full max-w-md rounded-t-3xl border border-border bg-surface px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 text-center shadow-card md:rounded-3xl md:pb-6">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white">
          <Icon name="heart" className="h-7 w-7" />
        </span>
        <h2 id="notif-prompt-title" className="mt-4 text-xl font-extrabold tracking-tight text-ink">
          Turn on notifications?
        </h2>
        <p className="mt-2 text-sm text-muted">
          Know right away when someone wants an intro, messages you, or confirms your connection. You can change this
          any time in Settings.
        </p>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <button type="button" onClick={allow} disabled={busy} className={`${btnPrimary} mt-5 w-full`}>
          {busy ? "Turning on…" : "Allow notifications"}
        </button>
        <button type="button" onClick={snooze} disabled={busy} className="mt-2 h-11 w-full text-sm font-semibold text-muted hover:text-ink">
          Not now
        </button>
      </div>
    </div>
  );
}
