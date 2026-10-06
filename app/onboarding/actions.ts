"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseOnboardingFormData } from "@/lib/profile-schema";
import { cleanInterests, cleanGoals } from "@/lib/interests";

export type OnboardingState = {
  fieldErrors?: Record<string, string[]>;
  formError?: string;
};

export async function createProfile(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = parseOnboardingFormData(formData);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    console.error("onboarding validation failed", fieldErrors);
    return {
      fieldErrors,
      formError: "Please fix the highlighted fields below.",
    };
  }

  const { is_18_plus, ...profileFields } = parsed.data;

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    is_18_plus,
    ...profileFields,
    interests: cleanInterests(formData.getAll("interests")),
    goals: cleanGoals(formData.getAll("goals")),
  });

  if (error) {
    console.error("onboarding profile insert failed", error);
    return { formError: error.message };
  }

  await supabase.rpc("log_event", { p_name: "onboarded" });

  // Org membership is optional at signup -- only redeemed if the
  // onboarding page verified a valid, email-matching invite and passed
  // its token through as a hidden field.
  const inviteToken = formData.get("invite_token");
  if (typeof inviteToken === "string" && inviteToken) {
    const { error: redeemError } = await supabase.rpc("redeem_org_invite", {
      p_token: inviteToken,
    });
    if (redeemError) {
      console.error("invite redemption failed after onboarding", redeemError);
      redirect(
        `/invite/${inviteToken}?error=${encodeURIComponent(redeemError.message)}`,
      );
    }
  }

  // New accounts land on interest-based suggestions before the app.
  redirect("/onboarding/people");
}
