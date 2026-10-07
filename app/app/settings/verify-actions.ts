"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendVerificationCodeEmail } from "@/lib/email";

export type VerifyState = { step?: "code" | "done"; email?: string; domain?: string; error?: string };

const REQUEST_ERRORS: Record<string, string> = {
  invalid_email: "That doesn't look like an email address.",
  not_school_email: "Use your school email. It should end in .edu.",
  not_work_email: "Use your work email. Personal addresses like Gmail don't count.",
  rate_limited: "Too many codes requested. Try again in an hour.",
};
const CODE_ERRORS: Record<string, string> = {
  wrong_code: "That code isn't right. Check the email and try again.",
  expired: "That code expired. Send a new one.",
  too_many_attempts: "Too many tries. Send a new code.",
};
const match = (msg: string, table: Record<string, string>, fallback: string) =>
  Object.entries(table).find(([k]) => msg.includes(k))?.[1] ?? fallback;

// One action handles both steps: send the code, then check it.
export async function verifyEmail(kind: "school" | "work", prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (formData.get("intent") === "check") {
    const code = String(formData.get("code") ?? "").replace(/\D/g, "");
    const { data, error } = await supabase.rpc("verify_email_code", { p_kind: kind, p_code: code });
    if (error) return { ...prev, error: match(error.message, CODE_ERRORS, "Couldn't verify. Try again.") };
    revalidatePath("/app/settings");
    revalidatePath("/app/me");
    return { step: "done", domain: data as string };
  }

  const email = String(formData.get("email") ?? "").trim();
  // Code creation is service-role only, so members can never read a code
  // without access to the inbox.
  const { data: code, error } = await createAdminClient().rpc("create_email_verification", {
    p_user: user.id,
    p_email: email,
    p_kind: kind,
  });
  if (error || !code) return { error: match(error?.message ?? "", REQUEST_ERRORS, "Couldn't send a code. Try again.") };
  await sendVerificationCodeEmail({ toEmail: email.toLowerCase(), code: code as string, kind });
  return { step: "code", email };
}

export async function removeVerification(formData: FormData) {
  const supabase = await createClient();
  const kind = formData.get("kind");
  if (kind !== "school" && kind !== "work") return;
  await supabase.rpc("remove_verification", { p_kind: kind });
  revalidatePath("/app/settings");
  revalidatePath("/app/me");
}
