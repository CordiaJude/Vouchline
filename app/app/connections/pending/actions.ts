"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseVisibility } from "@/app/components/visibility-choice";

export type AnswerState = { error?: string };

function friendlyError(message: string): string {
  if (message.includes("already_answered")) {
    return "You've already answered this connection.";
  }
  if (message.includes("not_participant")) {
    return "This connection isn't yours to answer.";
  }
  if (message.includes("not_found")) {
    return "This connection no longer exists.";
  }
  if (message.includes("invalid_categories") || message.includes("exactly_one_primary_required")) {
    return "Please choose at least one category and mark exactly one as primary.";
  }
  return "Something went wrong. Please try again.";
}

export async function answerPending(
  connectionId: string,
  _prevState: AnswerState,
  formData: FormData,
): Promise<AnswerState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const categoriesJson = formData.get("categories_json");
  const years = formData.get("years");
  const strength = formData.get("strength");

  let categories: unknown;
  try {
    categories = typeof categoriesJson === "string" ? JSON.parse(categoriesJson) : null;
  } catch {
    categories = null;
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    return { error: "Please choose how you know them." };
  }
  if (typeof years !== "string" || years === "") {
    return { error: "Please select how many years you've known them." };
  }
  if (typeof strength !== "string" || strength === "") {
    return { error: "Please select a closeness rating." };
  }

  const { error } = await supabase.rpc("answer_connection", {
    p_connection: connectionId,
    p_categories: categories,
    p_years: Number(years),
    p_strength: Number(strength),
  });

  if (error) {
    return { error: friendlyError(error.message) };
  }

  await supabase.rpc("set_connection_visibility", {
    p_connection: connectionId,
    p_public: parseVisibility(formData),
  });

  revalidatePath("/app/connections/pending");
  return {};
}

export async function declinePending(connectionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  await supabase.rpc("decline_connection", { p_connection: connectionId });
  revalidatePath("/app/connections/pending");
}
