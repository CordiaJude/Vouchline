import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/app/components/icons";
import { Inbox, type ConversationRow } from "./inbox";

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.rpc("my_conversations");
  const conversations = (data ?? []) as ConversationRow[];

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-5xl md:h-dvh">
      <div className="w-full border-border lg:w-[360px] lg:shrink-0 lg:border-r">
        <Inbox conversations={conversations} meId={user.id} />
      </div>
      <div className="hidden flex-1 flex-col items-center justify-center gap-3 text-center lg:flex">
        <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-ink text-ink">
          <Icon name="message" className="h-9 w-9" />
        </span>
        <p className="text-lg font-bold text-ink">Your messages</p>
        <p className="max-w-xs text-sm text-muted">Pick a conversation, or message a connection from their profile.</p>
      </div>
    </div>
  );
}
