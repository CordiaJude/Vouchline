"use client";

import { useActionState, useState } from "react";
import { setQuietHours, type QuietHoursState } from "./actions";
import { input, btnSecondarySmall } from "@/app/components/ui/styles";

const FALLBACK_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function timezoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

const initialState: QuietHoursState = {};

export function QuietHoursSettings({
  enabled,
  start,
  end,
  timezone,
}: {
  enabled: boolean;
  start: number;
  end: number;
  timezone: string | null;
}) {
  const [state, formAction, pending] = useActionState(setQuietHours, initialState);
  const [isEnabled, setIsEnabled] = useState(enabled);
  const timezones = timezoneOptions();
  const detectedTimezone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex items-start gap-3 text-sm text-body">
        <input
          type="checkbox"
          name="quiet_hours_enabled"
          defaultChecked={enabled}
          onChange={(e) => setIsEnabled(e.currentTarget.checked)}
          className="mt-1 h-4 w-4"
        />
        <span>
          Quiet hours. Pause intro-request emails during a window each day
          -- you&apos;ll still see them in the app, just not pinged. This is a
          professional tool, not a chat app.
        </span>
      </label>

      {isEnabled && (
        <div className="ml-7 flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="quiet-start" className="font-label text-xs font-medium text-body">
                From
              </label>
              <select
                id="quiet-start"
                name="quiet_hours_start"
                defaultValue={start}
                className={input}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="quiet-end" className="font-label text-xs font-medium text-body">
                Until
              </label>
              <select id="quiet-end" name="quiet_hours_end" defaultValue={end} className={input}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="quiet-tz" className="font-label text-xs font-medium text-body">
              Timezone
            </label>
            <select
              id="quiet-tz"
              name="timezone"
              defaultValue={timezone ?? detectedTimezone}
              className={input}
            >
              {!timezone && detectedTimezone && (
                <option value={detectedTimezone}>{detectedTimezone} (detected)</option>
              )}
              {timezones
                .filter((tz) => tz !== detectedTimezone)
                .map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className={`${btnSecondarySmall} self-start`}
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
