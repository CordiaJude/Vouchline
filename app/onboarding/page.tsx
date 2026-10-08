import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";
import { Logo } from "@/app/components/logo";
import { authCard } from "@/app/components/ui/styles";
import { safeNext } from "@/lib/safe-next";

export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  const { invite, next: nextParam } = await searchParams;
  const next = safeNext(nextParam);
  const inviteToken = typeof invite === "string" ? invite : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile) {
    redirect(inviteToken ? `/invite/${inviteToken}` : (next ?? "/app"));
  }

  // No org-membership gate on signup -- orgs are only for rosters,
  // invites, admin, and metrics, not a requirement to use the app at
  // all. An invite is still honored if present (pre-fills which org to
  // join), just not required.
  let invitePreview: { org_name: string; email: string | null } | null = null;
  let inviteError = false;

  if (inviteToken) {
    const previewResult = await supabase
      .rpc("org_invite_preview", { p_token: inviteToken })
      .single();
    const preview = previewResult.data as {
      org_name: string;
      email: string | null;
    } | null;

    if (previewResult.error || !preview) {
      inviteError = true;
    } else if (
      preview.email &&
      preview.email.toLowerCase() !== (user.email ?? "").toLowerCase()
    ) {
      inviteError = true;
    } else {
      invitePreview = preview;
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8 md:py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <div className={`${authCard} max-w-lg`}>
        {invitePreview && (
          <p className="mb-5 rounded-input bg-fill p-3 text-sm text-body">
            You&apos;re joining <span className="font-semibold text-ink">{invitePreview.org_name}</span>.
          </p>
        )}
        {inviteError && (
          <p className="mb-5 rounded-input bg-danger/10 p-3 text-sm text-danger">
            That invite link is invalid, expired, or was sent to a different
            email address. You can still finish setting up your account
            below.
          </p>
        )}
        <OnboardingForm
          userId={user.id}
          inviteToken={invitePreview ? inviteToken : undefined}
          returnTo={next}
          defaultFullName={
            typeof user.user_metadata?.full_name === "string"
              ? user.user_metadata.full_name
              : typeof user.user_metadata?.name === "string"
                ? user.user_metadata.name
                : undefined
          }
          // Google sign-in supplies a profile photo; start with it.
          defaultAvatarUrl={
            typeof user.user_metadata?.avatar_url === "string" && user.user_metadata.avatar_url.startsWith("https://")
              ? user.user_metadata.avatar_url
              : null
          }
        />
      </div>
    </div>
  );
}
