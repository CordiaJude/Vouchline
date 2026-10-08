"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/contacts";

export type PhoneState = { error?: string; saved?: boolean };

export async function savePhone(_prev: PhoneState, formData: FormData): Promise<PhoneState> {
  const raw = String(formData.get("phone") ?? "").trim();
  const phone = raw ? normalizePhone(raw) : "";
  if (phone === null) return { error: "Enter a full phone number, like (214) 555-0123." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_phone", { p_phone: phone });
  if (error) {
    console.error("[settings] set_my_phone failed", error);
    return { error: error.message.includes("rate_limited") ? "Too many changes today. Try tomorrow." : `Couldn't save (${error.message.slice(0, 80)}).` };
  }
  revalidatePath("/app/settings");
  return { saved: true };
}
