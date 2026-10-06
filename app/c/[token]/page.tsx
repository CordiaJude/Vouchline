import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnswerForm } from "./answer-form";

export default async function ConnectTokenPage({
  params,
}: PageProps<"/c/[token]">) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect_to=${encodeURIComponent(`/c/${token}`)}`);
  }

  const result = await supabase
    .rpc("connect_token_preview", { p_token: token })
    .maybeSingle();
  const preview = result.data as { owner_id: string; full_name: string } | null;
  const error = result.error;

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-sm">
        {error || !preview ? (
          <>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
              Can&apos;t connect
            </h1>
            <p className="mt-3 text-sm text-muted">
              {friendlyPreviewError(error?.message)}
            </p>
          </>
        ) : (
          <AnswerForm token={token} name={preview.full_name} />
        )}
      </div>
    </div>
  );
}

function friendlyPreviewError(message?: string): string {
  if (!message) return "This code isn't valid.";
  if (message.includes("invalid_token")) {
    return "This code has expired or is invalid. Ask them for a fresh one.";
  }
  if (message.includes("cannot_connect_self")) {
    return "This is your own connect code.";
  }
  if (message.includes("not_shared_org")) {
    return "You need to share a chapter or org with this person to connect.";
  }
  return "This code isn't valid.";
}
