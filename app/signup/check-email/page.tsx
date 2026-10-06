import { heading1, mutedText, pageShell } from "@/app/components/ui/styles";

// Only reached when the Supabase project's "Confirm email" setting is on
// -- signUpAction redirects straight to onboarding when it's off and a
// session comes back immediately.
export const dynamic = "force-dynamic";

export default function CheckEmailPage() {
  return (
    <div className={`${pageShell} justify-center`}>
      <div className="w-full max-w-sm text-center">
        <h1 className={heading1}>Confirm your email</h1>
        <p className={`${mutedText} mt-2`}>
          We sent a confirmation link to finish setting up your account.
          Click it to continue.
        </p>
      </div>
    </div>
  );
}
