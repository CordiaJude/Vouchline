"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signUpAction, type SignupState } from "./actions";
import {
  heading1,
  mutedText,
  input,
  btnPrimary,
  pageShell,
  authCard,
  link,
} from "@/app/components/ui/styles";
import { SocialSignIn } from "@/app/components/social-sign-in";
import { Logo } from "@/app/components/logo";

const initialState: SignupState = {};

export function SignupPageContent() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect_to") ?? "/onboarding";

  const [state, formAction, pending] = useActionState(
    signUpAction.bind(null, redirectTo),
    initialState,
  );

  return (
    <div className={`${pageShell} justify-center`}>
      <div className="mb-8">
        <Logo />
      </div>
      <div className={authCard}>
        <h1 className={heading1}>Create your account</h1>
        <p className={`${mutedText} mt-2`}>
          Just your name, email, and a password.
        </p>

        <div className="mt-6">
          <SocialSignIn />
        </div>
        <form action={formAction} className="flex flex-col gap-3">
          <label htmlFor="full_name" className="sr-only">
            Full name
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            autoComplete="name"
            placeholder="Full name"
            className={input}
          />

          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={input}
          />

          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Password (min. 8 characters)"
            className={input}
          />

          <label htmlFor="confirm_password" className="sr-only">
            Confirm password
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Confirm password"
            className={input}
          />

          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending ? "Creating account…" : "Create account"}
          </button>
          {state.error && (
            <p className="font-body text-sm text-danger">{state.error}</p>
          )}
        </form>

        <p className={`${mutedText} mt-4`}>
          Already have an account?{" "}
          <Link href="/login" className={link}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
