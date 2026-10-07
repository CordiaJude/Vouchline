"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { input } from "@/app/components/ui/styles";

const FORMAT = /^(?!\.)(?!.*\.\.)[a-z0-9_.]{3,30}(?<!\.)$/;

// Username with a live availability check. Posts `username`.
export function UsernameField({ current, error }: { current: string; error?: string }) {
  const [value, setValue] = useState(current);
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const v = value.trim().toLowerCase().replace(/^@/, "");

  useEffect(() => {
    if (v === current) return;
    if (!FORMAT.test(v)) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setStatus("checking");
      const { data } = await createClient().rpc("username_available", { p_username: v });
      if (!cancelled) setStatus(data ? "ok" : "taken");
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [v, current]);

  const shown = v === current ? "idle" : !FORMAT.test(v) ? "invalid" : status;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="username" className="text-sm font-semibold text-ink">
        Username
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-muted">@</span>
        <input
          id="username"
          name="username"
          value={v}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus("idle");
          }}
          maxLength={30}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`${input} pl-9`}
        />
      </div>
      <p
        className={`text-xs ${
          shown === "ok" ? "text-success" : shown === "taken" || shown === "invalid" ? "text-danger" : "text-muted"
        }`}
      >
        {shown === "ok"
          ? "Available"
          : shown === "taken"
            ? "That username is taken"
            : shown === "invalid"
              ? "3–30 characters: letters, numbers, underscores and periods"
              : shown === "checking"
                ? "Checking…"
                : `Your link: vouchline.com/@${v || current}`}
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
