"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { HIDE_COMPLETENESS_COOKIE } from "@/lib/ui-cookies";
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
