import { ForgotPasswordForm } from "./forgot-password-form";

// See app/page.tsx for why this is forced dynamic (CSP nonce).
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
