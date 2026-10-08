"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { normalizePhone } from "@/lib/contacts";
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

  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) {
    return {
      fieldErrors: { phone: ["Enter a full phone number, like (214) 555-0123 or +44 20 7946 0958."] },
      formError: "Please fix the highlighted fields below.",
    };
  }

  const { is_18_plus, ...profileFields } = parsed.data;

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    is_18_plus,
    ...profileFields,
    // "Let people find me" -- pre-checked on step 3; see 0032.
    is_public: formData.get("is_public") === "on",
    interests: cleanInterests(formData.getAll("interests")),
    goals: cleanGoals(formData.getAll("goals")),
  });

  if (error) {
    console.error("onboarding profile insert failed", error);
    return { formError: error.message };
  }

  if (phone) {
    const { error: phoneError } = await supabase.rpc("set_my_phone", { p_phone: phone });
    if (phoneError) console.error("onboarding: couldn't save phone", phoneError);
  }

  // Start their history with what they just told us (editable in Settings).
  const d = parsed.data;
  type HistoryRow = {
    user_id: string;
    kind: "work" | "education";
    organization: string;
    title?: string | null;
    school_id?: string | null;
    field?: string | null;
    end_year?: number | null;
  };
  const history: HistoryRow[] = [];
  if (d.employer) history.push({ user_id: user.id, kind: "work", title: d.job_title ?? null, organization: d.employer });
  if (d.school_name) {
    history.push({
      user_id: user.id,
      kind: "education",
      organization: d.school_name,
      school_id: d.school_id ?? null,
      field: d.major ?? null,
      end_year: d.grad_year ?? null,
    });
  }
  if (history.length) {
    const { error: historyError } = await supabase.from("profile_experiences").insert(history);
    if (historyError) console.error("onboarding: couldn't seed experience history", historyError);
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

  // Came here from a link (someone's QR code or profile)? Go straight back
  // to it. Otherwise: find people you know from your contacts, then
  // interest-based suggestions.
  const next = safeNext(formData.get("next"));
  redirect(next ?? "/onboarding/contacts");
}
