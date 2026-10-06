"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";
import {
  heading1,
  mutedText,
  input,
  btnPrimary,
  pageShell,
  authCard,
  link,
} from "@/app/components/ui/styles";
import { Logo } from "@/app/components/logo";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
    <div className={`${pageShell} justify-center`}>
      <div className="mb-8">
        <Logo />
      </div>
      <div className={authCard}>
        <h1 className={heading1}>Reset your password</h1>
        <p className={`${mutedText} mt-2`}>
          Enter your email and we&apos;ll send you a link to set a new
          password. This also works for accounts created before password
          sign-in existed.
        </p>

        {state.sent ? (
          <p className="mt-6 rounded-card bg-fill p-4 font-body text-sm text-body">
            If that email has an account, a reset link is on its way.
          </p>
        ) : (
          <form action={formAction} className="mt-6 flex flex-col gap-3">
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
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? "Sending…" : "Send reset link"}
            </button>
            {state.error && (
              <p className="font-body text-sm text-danger">{state.error}</p>
            )}
          </form>
        )}

        <p className={`${mutedText} mt-4`}>
          <Link href="/login" className={link}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
