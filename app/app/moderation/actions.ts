"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function resolveReport(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("report_id") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!id || !["dismiss", "remove_content", "suspend", "unsuspend"].includes(action)) return;
  await supabase.rpc("mod_resolve_report", { p_report: id, p_action: action, p_note: String(formData.get("note") ?? "") });
  revalidatePath("/app/moderation");
}
