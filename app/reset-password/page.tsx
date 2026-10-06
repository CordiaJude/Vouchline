import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only reachable with a live session, established by the recovery
  // link's code exchange in /auth/callback -- no session means someone
  // hit this URL directly without going through the emailed link.
  if (!user) {
    redirect("/forgot-password");
  }

  return <ResetPasswordForm />;
}
