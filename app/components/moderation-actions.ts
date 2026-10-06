"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}

export async function blockUser(targetId: string, revalidate?: string) {
  const { supabase, user } = await requireAuth();
  await supabase
    .from("blocks")
    .insert({ blocker_id: user.id, blocked_id: targetId });
  if (revalidate) revalidatePath(revalidate);
}

export async function unblockUser(targetId: string, revalidate?: string) {
  const { supabase, user } = await requireAuth();
  await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetId);
  if (revalidate) revalidatePath(revalidate);
}

export type ReportState = { error?: string; success?: boolean };

export async function submitReport(
  reportedId: string,
  introRequestId: string | null,
  _prevState: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const { supabase, user } = await requireAuth();

  const reason = formData.get("reason");
  if (typeof reason !== "string" || reason.trim().length < 5) {
    return { error: "Please give a bit more detail (at least 5 characters)." };
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reported_id: reportedId,
    intro_request_id: introRequestId,
    reason: reason.trim(),
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
