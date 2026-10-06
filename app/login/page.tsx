import { LoginPageContent } from "./login-form";

// See app/page.tsx for why this is forced dynamic (CSP nonce). Also
// required here specifically: route segment config can't live in a
// "use client" file, hence this thin server wrapper.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginPageContent />;
}
