import "server-only";
import type { createClient } from "@/lib/supabase/server";

export type QuietHoursSettings = {
  quiet_hours_enabled: boolean;
  quiet_hours_start: number;
  quiet_hours_end: number;
  timezone: string | null;
};

// Pure check: is it currently inside the user's configured quiet-hours
// window, in their own local time? A zero-width window (start === end)
// is treated as "off" rather than "always on" -- that's almost certainly
// a misconfiguration, and failing open (sending the email) is the safer
// side to fail on than going permanently silent.
export function isQuietHoursNow(settings: QuietHoursSettings, now: Date = new Date()): boolean {
  if (!settings.quiet_hours_enabled || !settings.timezone) {
    return false;
  }

  let hour: number;
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: settings.timezone,
      hour: "numeric",
      hour12: false,
    }).format(now);
    hour = parseInt(formatted, 10);
  } catch {
    // An invalid/unrecognized timezone string got stored somehow --
    // fail open rather than silently suppress every email forever.
    return false;
  }
  if (Number.isNaN(hour)) return false;
  if (hour === 24) hour = 0; // some ICU builds render midnight as "24"

  const { quiet_hours_start: start, quiet_hours_end: end } = settings;
  if (start === end) return false;
  if (start < end) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end; // overnight window, e.g. 21 -> 8
}

// Fetches one user's quiet-hours settings for a send-time check. Returns
// "disabled" defaults (never suppress) if the row can't be read at all --
// e.g. RLS denies it because the caller and the recipient no longer share
// a visible connection. Missing data should never turn into a permanently
// silent recipient.
export async function getQuietHoursSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<QuietHoursSettings> {
  const { data } = await supabase
    .from("profiles")
    .select("quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone")
    .eq("id", userId)
    .maybeSingle();

  return (
    data ?? {
      quiet_hours_enabled: false,
      quiet_hours_start: 21,
      quiet_hours_end: 8,
      timezone: null,
    }
  );
}
