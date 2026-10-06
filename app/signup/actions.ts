"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignupState = {
  error?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUpAction(
  redirectTo: string,
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const fullName = formData.get("full_name");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirm_password");

  if (typeof fullName !== "string" || fullName.trim().length < 2) {
    return { error: "Enter your full name." };
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords don't match." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName.trim() },
      emailRedirectTo: `${process.env.APP_URL}/auth/callback?redirect_to=${encodeURIComponent(redirectTo)}`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return { error: "An account with that email already exists. Sign in instead." };
    }
    return { error: error.message };
  }

  // If the Supabase project has email confirmation off, signUp already
  // returns a live session and we can skip straight to onboarding. If
  // it's on, there's no session yet -- the confirmation link (still one
  // unavoidable email, distinct from the old sign-in-by-email flow)
  // carries the user through /auth/callback instead.
  if (data.session) {
    redirect(redirectTo);
  }

  redirect("/signup/check-email");
}
