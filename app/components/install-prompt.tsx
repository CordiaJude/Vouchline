"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LogoMark } from "@/app/components/logo";
import { Icon } from "@/app/components/icons";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "vouchline:install-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

// "Add Vouchline to your home screen" on phones. Android/Chrome gets a
// real Install button (beforeinstallprompt); iPhone Safari gets the two
// taps to do it by hand (Apple offers no install API). Hidden once
// installed or dismissed.
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const env = useSyncExternalStore(
    () => () => {},
    () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
      const phone = window.matchMedia("(max-width: 767px)").matches;
      return standalone ? "installed" : !phone ? "desktop" : ios ? "ios" : readDismissed() ? "dismissed" : "android";
    },
    () => "unknown",
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (dismissed || readDismissedSafe(env)) return null;
  if (env === "ios" || (env === "android" && deferred)) {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-card border border-border bg-surface p-4">
        <LogoMark size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">Get the Vouchline app</p>
          {env === "ios" ? (
            <p className="mt-0.5 text-xs text-muted">
              Tap <Icon name="share" className="inline h-3.5 w-3.5 align-[-2px]" /> Share, then{" "}
              <span className="font-semibold text-ink">Add to Home Screen</span>.
            </p>
          ) : (
            <>
              <p className="mt-0.5 text-xs text-muted">Add it to your home screen. It opens full screen, like an app.</p>
              <button
                type="button"
                onClick={async () => {
                  await deferred?.prompt();
                  setDeferred(null);
                }}
                className="mt-2 inline-flex h-8 items-center rounded-pill bg-accent px-4 text-xs font-semibold text-on-accent"
              >
                Install
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              // storage unavailable: just hide for now
            }
            setDismissed(true);
          }}
          className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center text-muted hover:text-ink"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return null;
}

// iOS dismissals are remembered too (the env snapshot only checks it for Android).
function readDismissedSafe(env: string) {
  return env === "ios" && readDismissed();
}
