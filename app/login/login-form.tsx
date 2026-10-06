"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signInAction, type LoginState } from "./actions";
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

const initialState: LoginState = {};

export function LoginPageContent() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect_to") ?? "/app";

  const [state, formAction, pending] = useActionState(
    signInAction.bind(null, redirectTo),
    initialState,
  );

  return (
    <div className={`${pageShell} justify-center`}>
      <div className="mb-8">
        <Logo />
      </div>
      <div className={authCard}>
        <h1 className={heading1}>Sign in</h1>
        <p className={`${mutedText} mt-2`}>
          Enter your email and password.
        </p>

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
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            className={input}
          />
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
          {state.error && (
            <p className="font-body text-sm text-danger">{state.error}</p>
          )}
        </form>

        <p className={`${mutedText} mt-4`}>
          <Link href="/forgot-password" className={link}>
            Forgot your password?
          </Link>
        </p>
        <p className={`${mutedText} mt-2`}>
          New here?{" "}
          <Link href="/signup" className={link}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
