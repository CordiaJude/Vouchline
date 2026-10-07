"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { btnPrimarySmall, btnSecondarySmall } from "@/app/components/ui/styles";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type Support = "unknown" | "unsupported" | "ios-install" | "ok";

// Turn phone/computer notifications on or off for THIS device.
export function PushSettings({ userId }: { userId: string }) {
  const support = useSyncExternalStore<Support>(
    () => () => {},
    () => {
      const hasApis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (ios && !standalone) return "ios-install";
      return hasApis ? "ok" : "unsupported";
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
      if (!VAPID) throw new Error("not_configured");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notifications are blocked. Allow them for this site in your browser or phone settings.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const { error: err } = await createClient()
        .from("push_subscriptions")
        .upsert(
          { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 300) },
          { onConflict: "endpoint" },
        );
      if (err) throw err;
      setEnabled(true);
    } catch (e) {
      setError(
        (e as Error).message === "not_configured"
          ? "Notifications aren't set up on this site yet."
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
