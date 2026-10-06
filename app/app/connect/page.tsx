import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConnectQr } from "./connect-qr";
import { StickerQr } from "./sticker-qr";
import { Avatar } from "@/app/components/avatar";
import { heading1, heading2, mutedText, btnSecondarySmall } from "@/app/components/ui/styles";

export default async function ConnectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: token, error }, { data: profile }] = await Promise.all([
    supabase.rpc("create_connect_token"),
    supabase
      .from("profiles")
      .select("full_name, avatar_url, sticker_mode")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-sm text-center">
        {profile && (
          <div className="flex flex-col items-center gap-2">
            <Avatar id={user.id} name={profile.full_name} src={profile.avatar_url} size={40} />
            <p className="text-sm font-medium text-ink">{profile.full_name}</p>
          </div>
        )}

        <h1 className={`${heading1} mt-4`}>Your connect code</h1>
        <p className={`${mutedText} mt-2`}>
          Have them scan this with their phone camera.
        </p>

        {error || !token ? (
          <div className="mt-6 flex flex-col items-center gap-3">
            <p className="text-sm text-danger">
              Couldn&apos;t generate a code.
            </p>
            {/* A plain anchor, not next/link -- this error means the
                server fetch itself failed, so the retry needs a full
                reload rather than a soft client-side transition that
                might not re-run it. */}
            <a href="/app/connect" className={btnSecondarySmall}>
              Try again
            </a>
          </div>
        ) : (
          <ConnectQr initialToken={token} />
        )}

        {profile?.sticker_mode && (
          <div className="mt-8 border-t border-border pt-6">
            <h2 className={heading2}>Your sticker link</h2>
            <p className={`${mutedText} mt-1`}>
              Program this into your NFC sticker, or print the QR below.
              Unlike the code above, it never expires or changes.
            </p>
            <div className="mt-4">
              <StickerQr url={`${process.env.APP_URL}/c/u/${user.id}`} />
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-2 border-t border-border pt-6">
          <p className={mutedText}>Not with them right now?</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href="/app/search" className={btnSecondarySmall}>
              Search and send a request
            </Link>
            <Link href="/app/claim" className={btnSecondarySmall}>
              Claim someone you know
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
