"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseVisibility } from "@/app/components/visibility-choice";

export type RedeemState = { error?: string };

function friendlyRedeemError(message: string): string {
  if (message.includes("invalid_token")) {
    return "This code has expired or is invalid. Ask them for a fresh one.";
  }
  if (message.includes("cannot_connect_self")) {
    return "You can't connect with yourself.";
  }
  if (message.includes("blocked")) {
    return "This connection isn't available.";
  }
  if (message.includes("already_answered")) {
    return "You've already answered this connection.";
  }
  if (message.includes("rate_limited")) {
    return "You're connecting too fast. Try again in a bit.";
  }
  if (message.includes("invalid_categories") || message.includes("exactly_one_primary_required")) {
    return "Please choose at least one category and mark exactly one as primary.";
  }
  return "Something went wrong. Please try again.";
}

export async function redeemToken(
  token: string,
  _prevState: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect_to=${encodeURIComponent(`/c/${token}`)}`);
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

  const { data: connectionId, error } = await supabase.rpc("redeem_connect_token", {
    p_token: token,
    p_categories: categories,
    p_years: Number(years),
    p_strength: Number(strength),
  });

  if (error) {
    return { error: friendlyRedeemError(error.message) };
  }

  if (connectionId) {
    await supabase.rpc("set_connection_visibility", {
      p_connection: connectionId,
      p_public: parseVisibility(formData),
    });
  }

  redirect("/app?connected=1");
}
