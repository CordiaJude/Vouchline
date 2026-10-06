"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ClaimState = { error?: string; success?: boolean };

function friendlyError(message: string): string {
  if (message.includes("cannot_claim_self")) {
    return "You can't claim yourself.";
  }
  if (message.includes("not_found")) {
    return "That person couldn't be found.";
  }
  if (message.includes("rate_limited")) {
    return "You're claiming people too fast. Try again in a bit.";
  }
  return "Something went wrong. Please try again.";
}

export async function claimPersonAction(
  personId: string,
  _prevState: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const category = formData.get("category");
  const years = formData.get("years");
  if (typeof category !== "string" || !category) {
    return { error: "Please choose how you know them." };
  }

  const { error } = await supabase.rpc("claim_person", {
    p_person: personId,
    p_category: category,
    p_is_former: formData.get("is_former") === "on",
    p_years: years ? Number(years) : null,
    p_note: (formData.get("note") as string) || null,
  });

  if (error) {
    return { error: friendlyError(error.message) };
  }

  return { success: true };
}

export async function claimStubAction(
  _prevState: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const fullName = formData.get("full_name");
  const category = formData.get("category");
  const years = formData.get("years");
  const linkedinUrl = formData.get("linkedin_url");

  if (typeof fullName !== "string" || fullName.trim().length < 2) {
    return { error: "Please enter their name." };
  }
  if (typeof category !== "string" || !category) {
    return { error: "Please choose how you know them." };
  }
  if (
    typeof linkedinUrl === "string" &&
    linkedinUrl &&
    !/^https:\/\/(www\.)?linkedin\.com\//.test(linkedinUrl)
  ) {
    return { error: "That doesn't look like a LinkedIn URL." };
  }

  const { error } = await supabase.rpc("claim_stub", {
    p_full_name: fullName.trim(),
    p_linkedin_url: (linkedinUrl as string) || null,
    p_category: category,
    p_is_former: formData.get("is_former") === "on",
    p_years: years ? Number(years) : null,
    p_note: (formData.get("note") as string) || null,
  });

  if (error) {
    return { error: friendlyError(error.message) };
  }

  return { success: true };
}
