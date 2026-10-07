"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// "Message" buttons (profiles, contacts) and the intro page's "Open chat".
// Both RPCs return the existing conversation when there already is one.

export async function openDirectChat(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const other = formData.get("person_id");
  if (typeof other !== "string" || !other) return;
  const { data, error } = await supabase.rpc("start_direct_conversation", { p_other: other });
  if (error || !data) redirect(`/app/u/${other}?message_error=1`);
  redirect(`/app/messages/${data}`);
}

export async function openIntroChat(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const intro = formData.get("intro_id");
  if (typeof intro !== "string" || !intro) return;
  const { data, error } = await supabase.rpc("open_intro_conversation", { p_intro: intro });
  if (error || !data) redirect(`/app/intros/${intro}`);
  redirect(`/app/messages/${data}`);
}
