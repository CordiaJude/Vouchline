"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type TargetActionState = { error?: string; success?: boolean };

function friendlyError(message: string): string {
  if (message.includes("cannot_target_self")) {
    return "You can't target yourself.";
  }
  if (message.includes("not_found")) {
    return "That person couldn't be found.";
  }
  if (message.includes("invalid_name")) {
    return "Please enter their name.";
  }
  return "Something went wrong. Please try again.";
}

export async function addTargetAction(
  personId: string,
  _prevState: TargetActionState,
  formData: FormData,
): Promise<TargetActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const note = (formData.get("note") as string) || null;
  const { error } = await supabase.rpc("add_target", { p_person: personId, p_note: note });

  if (error) {
    return { error: friendlyError(error.message) };
  }

  revalidatePath("/app/intros");
  return { success: true };
}

export async function addTargetStubAction(
  _prevState: TargetActionState,
  formData: FormData,
): Promise<TargetActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const fullName = formData.get("full_name");
  const linkedinUrl = formData.get("linkedin_url");
  const note = (formData.get("note") as string) || null;

  if (typeof fullName !== "string" || fullName.trim().length < 2) {
    return { error: "Please enter their name." };
  }
  if (
    typeof linkedinUrl === "string" &&
    linkedinUrl &&
    !/^https:\/\/(www\.)?linkedin\.com\//.test(linkedinUrl)
  ) {
    return { error: "That doesn't look like a LinkedIn URL." };
  }

  const { error } = await supabase.rpc("add_target_stub", {
    p_full_name: fullName.trim(),
    p_linkedin_url: (linkedinUrl as string) || null,
    p_note: note,
  });

  if (error) {
    return { error: friendlyError(error.message) };
  }

  revalidatePath("/app/intros");
  return { success: true };
}

export async function setTargetStage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const id = formData.get("id") as string;
  const stage = formData.get("stage") as string;

  await supabase.rpc("set_target_stage", { p_id: id, p_stage: stage });
  revalidatePath("/app/intros");
}

export async function removeTarget(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const id = formData.get("id") as string;
  await supabase.rpc("remove_target", { p_id: id });
  revalidatePath("/app/intros");
}
