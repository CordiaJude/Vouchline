"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Provider = "google" | "apple";

// One-tap sign-in. Supabase handles the OAuth round trip and lands on
// /auth/callback, which sends brand-new accounts to onboarding.
// Each provider must be enabled in Supabase (Authentication -> Providers).
export function SocialSignIn({ redirectTo = "/app" }: { redirectTo?: string }) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(provider: Provider) {
    setBusy(provider);
    setError(null);
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect_to=${encodeURIComponent(redirectTo)}`,
      },
    });
    if (err) {
      setBusy(null);
      setError(
        err.message.toLowerCase().includes("not enabled")
          ? `${provider === "google" ? "Google" : "Apple"} sign-in isn't set up yet. Use email for now.`
          : "Couldn't start sign-in. Try again.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => go("google")}
        disabled={busy !== null}
        className="inline-flex h-12 items-center justify-center gap-3 rounded-pill border border-border-strong bg-surface px-6 text-sm font-semibold text-ink transition-colors hover:bg-fill disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>
      <button
        type="button"
        onClick={() => go("apple")}
        disabled={busy !== null}
        className="inline-flex h-12 items-center justify-center gap-3 rounded-pill bg-white px-6 text-sm font-semibold text-black transition-colors hover:bg-[#e8e8e8] disabled:opacity-60"
      >
        <svg width="16" height="18" viewBox="0 0 814 1000" aria-hidden="true">
          <path
            fill="currentColor"
            d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-165-40c-77 0-104 41-166 41s-106-58-156-128C44 790 0 669 0 554c0-185 120-283 239-283 63 0 115 41 155 41 38 0 97-44 169-44 27 0 126 3 191 96zM554 168c30-35 51-84 51-133 0-7-1-14-2-19-48 2-106 32-140 72-27 31-53 80-53 130 0 8 1 15 2 18 3 1 9 1 14 1 43 0 97-29 128-69z"
          />
        </svg>
        {busy === "apple" ? "Opening Apple…" : "Continue with Apple"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="my-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
