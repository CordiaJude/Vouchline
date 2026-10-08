import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/app/components/logo";
import { FindFriends } from "@/app/app/find-friends/find-friends";

// Onboarding: find people you already know from your contacts. Skippable.
export const dynamic = "force-dynamic";

export default async function OnboardingContactsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8 md:py-12">
      <div className="w-full max-w-lg">
        <Logo />
        <h1 className="mt-8 text-2xl font-extrabold tracking-tight text-ink">Find people you know</h1>
        <p className="mt-1 text-sm text-muted">
          Check your contacts for friends already on Vouchline. You pick what to check, and nothing is saved.
        </p>
        <FindFriends continueHref="/onboarding/people" />
      </div>
    </div>
  );
}
