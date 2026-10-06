"use server";

import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState = {
  sent?: boolean;
  error?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = formData.get("email");
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.APP_URL}/auth/callback?redirect_to=/reset-password`,
  });

  // Always report success, whether or not the email exists -- otherwise
  // this becomes an account-enumeration oracle.
  return { sent: true };
}
