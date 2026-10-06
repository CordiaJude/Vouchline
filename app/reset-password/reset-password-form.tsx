"use client";

import { useActionState } from "react";
import { setNewPassword, type ResetPasswordState } from "./actions";
import {
  heading1,
  mutedText,
  input,
  btnPrimary,
  pageShell,
  authCard,
} from "@/app/components/ui/styles";
import { Logo } from "@/app/components/logo";

const initialState: ResetPasswordState = {};

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    setNewPassword,
    initialState,
  );

  return (
    <div className={`${pageShell} justify-center`}>
      <div className="mb-8">
        <Logo />
      </div>
      <div className={authCard}>
        <h1 className={heading1}>Set a new password</h1>
        <p className={`${mutedText} mt-2`}>
          Choose a password for your account.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-3">
          <label htmlFor="password" className="sr-only">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="New password (min. 8 characters)"
            className={input}
          />
          <label htmlFor="confirm_password" className="sr-only">
            Confirm new password
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Confirm new password"
            className={input}
          />
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending ? "Saving…" : "Save password"}
          </button>
          {state.error && (
            <p className="font-body text-sm text-danger">{state.error}</p>
          )}
        </form>
      </div>
    </div>
  );
}
