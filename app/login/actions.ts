"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type LoginState = {
  error?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInAction(
  redirectTo: string,
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (typeof password !== "string" || password.length === 0) {
    return { error: "Enter your password." };
  }

  const admin = createAdminClient();
  const { error: rateLimitError } = await admin.rpc(
    "check_and_log_login_attempt",
    { p_email: email },
  );
  if (rateLimitError) {
    return {
      error: "Too many sign-in attempts. Try again in a few minutes.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Incorrect email or password." };
  }

  await supabase.rpc("recompute_my_reach_score");

  redirect(redirectTo);
}
