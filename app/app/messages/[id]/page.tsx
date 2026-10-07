import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Inbox, type ConversationRow, type Person } from "../inbox";
import { ChatThread, type ChatMessage } from "./chat-thread";

export default async function ConversationPage({ params }: PageProps<"/app/messages/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: details, error }, { data: msgs }, { data: convs }, { data: me }] = await Promise.all([
    supabase.rpc("conversation_details", { p_conversation: id }).maybeSingle(),
    supabase.rpc("conversation_messages", { p_conversation: id, p_limit: 50 }),
    supabase.rpc("my_conversations"),
    supabase.from("profiles").select("id, full_name, avatar_url").eq("id", user.id).maybeSingle(),
  ]);
  if (error || !details) notFound();

  const d = details as { id: string; kind: "intro" | "direct"; intro_id: string | null; others: Person[] };
  // Oldest first for display.
  const messages = ((msgs ?? []) as ChatMessage[]).slice().reverse();

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] w-full max-w-5xl md:h-dvh">
      <div className="hidden w-[360px] shrink-0 border-r border-border lg:block">
        <Inbox conversations={(convs ?? []) as ConversationRow[]} meId={user.id} activeId={id} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatThread
          conversationId={id}
          kind={d.kind}
          introId={d.intro_id}
          others={d.others}
          me={{ id: user.id, full_name: me?.full_name ?? "You", avatar_url: me?.avatar_url ?? null }}
          initialMessages={messages}
        />
      </div>
    </div>
  );
}
