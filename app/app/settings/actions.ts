"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseProfileFormData } from "@/lib/profile-schema";
import { cleanInterests, cleanGoals } from "@/lib/interests";

export type SettingsState = {
  fieldErrors?: Record<string, string[]>;
  formError?: string;
  success?: boolean;
};

export async function updateProfile(
  _prevState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = parseProfileFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // A school typed by hand ("not listed") must drop any previously
  // picked list entry, or the old school_id would linger behind the new name.
  const update: Record<string, unknown> = { ...parsed.data };
  if (formData.has("school_name") && !formData.get("school_id")) {
    update.school_id = null;
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505" || error.message.includes("profiles_username_key")) {
      return { fieldErrors: { username: ["That username is taken."] } };
    }
    if (error.message.includes("profiles_username_format")) {
      return { fieldErrors: { username: ["That username isn't allowed."] } };
    }
    return { formError: error.message };
  }

  return { success: true };
}

export async function setStickerMode(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const enabled = formData.get("sticker_mode") === "on";

  await supabase
    .from("profiles")
    .update({ sticker_mode: enabled })
    .eq("id", user.id);

  revalidatePath("/app/settings");
}

export async function setPublicProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const enabled = formData.get("is_public") === "on";

  await supabase.from("profiles").update({ is_public: enabled }).eq("id", user.id);

  revalidatePath("/app/settings");
}

export type QuietHoursState = { error?: string };

// Validated app-side against the browser's own IANA database rather than
// a DB constraint -- Postgres CHECK constraints can't subquery
// pg_timezone_names, and Intl.supportedValuesOf is exactly the same data
// source the settings form's <select> was populated from.
export async function setQuietHours(
  _prevState: QuietHoursState,
  formData: FormData,
): Promise<QuietHoursState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const enabled = formData.get("quiet_hours_enabled") === "on";
  const start = Number(formData.get("quiet_hours_start"));
  const end = Number(formData.get("quiet_hours_end"));
  const timezone = formData.get("timezone");

  if (!Number.isInteger(start) || start < 0 || start > 23) {
    return { error: "Invalid start hour." };
  }
  if (!Number.isInteger(end) || end < 0 || end > 23) {
    return { error: "Invalid end hour." };
  }
  if (enabled) {
    if (typeof timezone !== "string" || !timezone) {
      return { error: "Choose a timezone to enable quiet hours." };
    }
    try {
      if (!Intl.supportedValuesOf("timeZone").includes(timezone)) {
        return { error: "Unrecognized timezone." };
      }
    } catch {
      // Intl.supportedValuesOf unavailable in this runtime -- fall back
      // to just trusting the value rather than blocking the feature.
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      quiet_hours_enabled: enabled,
      quiet_hours_start: start,
      quiet_hours_end: end,
      timezone: typeof timezone === "string" && timezone ? timezone : null,
    })
    .eq("id", user.id);

  if (error) {
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/app/settings");
  return {};
}

export async function deleteAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    throw new Error(error.message);
  }

  await supabase.auth.signOut();
  redirect("/");
}

export type InterestsState = { saved?: boolean; error?: string };

export async function saveInterests(_prevState: InterestsState, formData: FormData): Promise<InterestsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({
      interests: cleanInterests(formData.getAll("interests")),
      goals: cleanGoals(formData.getAll("goals")),
    })
    .eq("id", user.id);
  if (error) return { error: "Couldn't save. Try again." };
  revalidatePath("/app/settings");
  return { saved: true };
}
