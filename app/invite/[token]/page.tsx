import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { joinOrg } from "./actions";
import { heading1, mutedText, btnPrimary } from "@/app/components/ui/styles";

function friendlyError(message?: string): string {
  if (!message) return "";
  if (message.includes("invalid_invite")) {
    return "This invite link isn't valid.";
  }
  if (message.includes("invite_expired")) {
    return "This invite has expired. Ask your chapter admin for a new one.";
  }
  if (message.includes("invite_exhausted")) {
    return "This invite has already been used.";
  }
  if (message.includes("email_mismatch")) {
    return "This invite was sent to a different email address than the one you're signed in with.";
  }
  return "Something went wrong. Please try again.";
}

export default async function InvitePage({
  params,
  searchParams,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { error: errorParam } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect_to=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const errorMessage =
    typeof errorParam === "string" ? friendlyError(errorParam) : null;

  const result = await supabase
    .rpc("org_invite_preview", { p_token: token })
    .maybeSingle();
  const preview = result.data as {
    org_id: string;
    org_name: string;
    full_name: string | null;
  } | null;

  if (result.error || !preview) {
    return (
      <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
        <div className="w-full max-w-sm">
          <h1 className={heading1}>Can&apos;t use this invite</h1>
          <p className={`${mutedText} mt-3`}>
            {friendlyError(result.error?.message) ||
              "This invite link isn't valid."}
          </p>
        </div>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-sm">
        <h1 className={heading1}>Join {preview.org_name}</h1>
        <p className={`${mutedText} mt-2`}>
          You&apos;ve been invited to join {preview.org_name} on Vouchline.
        </p>

        {errorMessage && (
          <p className="mt-4 rounded-card bg-danger/10 p-3 font-body text-sm text-danger">
            {errorMessage}
          </p>
        )}

        {!profile ? (
          <Link href={`/onboarding?invite=${token}`} className={`${btnPrimary} mt-6`}>
            Finish your profile to join
          </Link>
        ) : (
          <form action={joinOrg.bind(null, token)} className="mt-6">
            <button type="submit" className={`${btnPrimary} w-full`}>
              Join {preview.org_name}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
