import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function StickerConnectPage({
  params,
}: PageProps<"/c/u/[userId]">) {
  const { userId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect_to=${encodeURIComponent(`/c/u/${userId}`)}`);
  }

  const { data: token, error } = await supabase.rpc("create_sticker_token", {
    p_owner: userId,
  });

  if (error || !token) {
    return (
      <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            Can&apos;t connect
          </h1>
          <p className="mt-3 text-sm text-muted">
            {friendlyStickerError(error?.message)}
          </p>
        </div>
      </div>
    );
  }

  redirect(`/c/${token}`);
}

function friendlyStickerError(message?: string): string {
  if (!message) return "This connect sticker isn't active.";
  if (message.includes("sticker_mode_disabled")) {
    return "This person hasn't turned on sticker connections.";
  }
  if (message.includes("not_shared_org")) {
    return "You need to share a chapter or org with this person to connect.";
  }
  if (message.includes("rate_limited")) {
    return "This sticker is being used too fast right now. Try again shortly.";
  }
  return "This connect sticker isn't active.";
}
