"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { HIDE_COMPLETENESS_COOKIE, HIDE_SETUP_COOKIE, THEME_COOKIE, parseTheme, PALETTE_COOKIE, parsePalette } from "@/lib/ui-cookies";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// "Your profile is X% complete" can be dismissed. A cookie (not the
// database) since it's a per-device nicety; it comes back after 90 days.
export async function dismissCompleteness() {
  (await cookies()).set(HIDE_COMPLETENESS_COOKIE, "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/app", "layout");
}

// Settings -> Appearance. Stored per device, like a phone's own setting.
export async function setTheme(formData: FormData) {
  const theme = parseTheme(String(formData.get("theme") ?? ""));
  (await cookies()).set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}

export async function setPalette(formData: FormData) {
  const palette = parsePalette(String(formData.get("palette") ?? ""));
  (await cookies()).set(PALETTE_COOKIE, palette, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}

// Home's "Get started" checklist: hide it for good on this device.
export async function dismissSetup() {
  (await cookies()).set(HIDE_SETUP_COOKIE, "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/app", "layout");
}
