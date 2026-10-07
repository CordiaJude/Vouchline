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

export type ReportContentState = { error?: string; done?: boolean };

// Report a person, a chat message, or a vouch (report_content, 0042).
export async function reportContent(
  target: { kind: "user" | "message" | "vouch"; reportedId?: string; messageId?: string; vouchId?: string },
  _prev: ReportContentState,
  formData: FormData,
): Promise<ReportContentState> {
  const { supabase } = await requireAuth();
  const reason = [formData.get("reason"), String(formData.get("details") ?? "").trim()].filter(Boolean).join(": ");
  if (reason.length < 5) return { error: "Pick a reason." };
  const { error } = await supabase.rpc("report_content", {
    p_kind: target.kind,
    p_reason: reason.slice(0, 1000),
    p_reported: target.reportedId ?? null,
    p_message: target.messageId ?? null,
    p_vouch: target.vouchId ?? null,
  });
  if (error) {
    if (error.message.includes("rate_limited")) return { error: "You've sent a lot of reports today. Try again tomorrow." };
    return { error: "Couldn't send the report. Try again." };
  }
  return { done: true };
}

// Block from inside a chat, then leave it.
export async function blockFromChat(formData: FormData) {
  const { supabase, user } = await requireAuth();
  const target = String(formData.get("person_id") ?? "");
  if (!target) return;
  await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: target });
  revalidatePath("/app/messages");
  redirect("/app/messages");
}
