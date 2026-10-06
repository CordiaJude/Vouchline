"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function markReadAndGo(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const id = formData.get("id") as string;
  const link = formData.get("link") as string | null;
  await supabase.rpc("mark_notification_read", { p_id: id });
  revalidatePath("/app/notifications");

  // Only ever redirect to an internal, app-relative path -- never trust
  // this as an open redirect target.
  if (link && link.startsWith("/") && !link.startsWith("//")) {
    redirect(link);
  }
}

export async function markAllRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  await supabase.rpc("mark_all_notifications_read");
  revalidatePath("/app/notifications");
}
