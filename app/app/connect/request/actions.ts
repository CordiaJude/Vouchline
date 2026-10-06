"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseVisibility } from "@/app/components/visibility-choice";

export type RequestConnectState = { error?: string; success?: boolean };

function friendlyError(message: string): string {
  if (message.includes("cannot_connect_self")) {
    return "You can't connect with yourself.";
  }
  if (message.includes("blocked")) {
    return "You can't send a request to this person.";
  }
  if (message.includes("rate_limited")) {
    return "You're sending requests too fast. Try again in a bit.";
  }
  if (message.includes("invalid_categories") || message.includes("exactly_one_primary_required")) {
    return "Please choose at least one category and mark exactly one as primary.";
  }
  return "Something went wrong. Please try again.";
}

export async function requestConnectionAction(
  personId: string,
  _prevState: RequestConnectState,
  formData: FormData,
): Promise<RequestConnectState> {
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
  if (!years) {
    return { error: "Please select how many years you've known them." };
  }
  if (!strength) {
    return { error: "Please select how close you are." };
  }

  const { data: connectionId, error } = await supabase.rpc("request_connection", {
    p_other: personId,
    p_categories: categories,
    p_years: Number(years),
    p_strength: Number(strength),
  });

  if (error) {
    return { error: friendlyError(error.message) };
  }

  if (connectionId) {
    await supabase.rpc("set_connection_visibility", {
      p_connection: connectionId,
      p_public: parseVisibility(formData),
    });
  }

  return { success: true };
}
