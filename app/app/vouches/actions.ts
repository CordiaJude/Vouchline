"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type VouchState = { error?: string; saved?: boolean };

export async function writeVouch(subjectId: string, _prev: VouchState, formData: FormData): Promise<VouchState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 20) return { error: "Write at least 20 characters. Be specific." };
  if (body.length > 500) return { error: "Keep it under 500 characters." };

  const { error } = await supabase.rpc("write_vouch", { p_subject: subjectId, p_body: body });
  if (error) {
    if (error.message.includes("rate_limited")) return { error: "You've written a lot of vouches today. Try tomorrow." };
    if (error.message.includes("not_connected")) return { error: "You can only vouch for confirmed connections." };
    return { error: "Couldn't save your vouch. Try again." };
  }
  revalidatePath(`/app/u/${subjectId}`);
  return { saved: true };
}

export async function deleteVouch(formData: FormData) {
  const supabase = await createClient();
  const subject = String(formData.get("subject_id") ?? "");
  if (!subject) return;
  await supabase.rpc("delete_my_vouch", { p_subject: subject });
  revalidatePath(`/app/u/${subject}`);
}

export async function respondVouch(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("vouch_id") ?? "");
  if (!id) return;
  await supabase.rpc("respond_vouch", { p_vouch: id, p_approve: formData.get("approve") === "true" });
  revalidatePath("/app/me");
  revalidatePath("/app");
}
