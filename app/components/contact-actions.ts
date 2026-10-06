"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ContactState = { sent?: boolean; error?: string };

// Cold "add as contact" -- see 0031_interests_and_contacts.sql. Not a
// verified connection; it never creates an intro path.
export async function sendContactRequest(personId: string, prev: ContactState): Promise<ContactState> {
  if (prev.sent) return prev;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("send_contact_request", { p_target: personId });
  if (error) {
    if (error.message.includes("rate_limited")) {
      return { error: "You've added a lot of people today. Try again tomorrow." };
    }
    return { error: "Couldn't add them. Try again." };
  }
  return { sent: true };
}

export async function respondContactRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = formData.get("request_id");
  if (typeof id !== "string" || !id) return;
  await supabase.rpc("respond_contact_request", {
    p_request: id,
    p_accept: formData.get("accept") === "true",
  });
  revalidatePath("/app/connections/pending");
  revalidatePath("/app/network");
}
