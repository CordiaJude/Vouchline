"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { isStandalone, pushSupported, subscribeToPush } from "@/lib/push-client";
import { btnPrimarySmall, btnSecondarySmall } from "@/app/components/ui/styles";

type Support = "unknown" | "unsupported" | "ios-install" | "ok";

// Turn phone/computer notifications on or off for THIS device.
export function PushSettings({ userId }: { userId: string }) {
  const support = useSyncExternalStore<Support>(
    () => () => {},
    () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      if (ios && !isStandalone()) return "ios-install";
      return pushSupported() ? "ok" : "unsupported";
    },
    () => "unknown",
  );
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (support !== "ok") return;
    let cancelled = false;
    void navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setEnabled(!!sub && Notification.permission === "granted");
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [support]);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      await subscribeToPush(userId);
      setEnabled(true);
    } catch (e) {
      const reason = (e as Error).message;
      setError(
        reason === "not_configured"
          ? "Notifications aren't set up on this site yet."
          : reason === "denied"
            ? "Notifications are blocked. Allow them for this site in your browser or phone settings."
            : "Couldn't turn on notifications. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await createClient().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-ink">Notifications on this device</p>
      <p className="text-xs text-muted">Intro requests, messages, vouches and connections. Quiet hours below still apply.</p>
      {support === "ios-install" ? (
        <p className="text-sm text-body">
          On iPhone, first add Vouchline to your Home Screen (Share → Add to Home Screen), open it from there, then come
          back here.
        </p>
      ) : support === "unsupported" ? (
        <p className="text-sm text-muted">This browser doesn&apos;t support notifications.</p>
      ) : enabled ? (
        <button type="button" onClick={turnOff} disabled={busy} className={`${btnSecondarySmall} self-start`}>
          {busy ? "Turning off…" : "Turn off"}
        </button>
      ) : (
        <button type="button" onClick={turnOn} disabled={busy || enabled === null} className={`${btnPrimarySmall} self-start`}>
          {busy ? "Turning on…" : "Turn on notifications"}
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
