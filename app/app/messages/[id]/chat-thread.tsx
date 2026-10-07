"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/app/components/avatar";
import { Icon } from "@/app/components/icons";
import { ConversationAvatar, conversationTitle, type Person } from "../inbox";

export type ChatMessage = { id: string; sender_id: string | null; body: string; created_at: string };

// Live chat: new messages arrive over Supabase Realtime, with a quiet
// poll as a fallback (e.g. if a network blocks websockets). Sends are
// optimistic -- your message shows instantly and is swapped for the
// saved one when the server answers.
export function ChatThread({
  conversationId,
  kind,
  introId,
  others,
  me,
  initialMessages,
}: {
  conversationId: string;
  kind: "intro" | "direct";
  introId: string | null;
  others: Person[];
  me: Person;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [olderDone, setOlderDone] = useState(initialMessages.length < 50);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const people = new Map([me, ...others].map((p) => [p.id, p]));

  const sb = useCallback(() => (supabaseRef.current ??= createClient()), []);

  const merge = useCallback((incoming: ChatMessage[]) => {
    setMessages((cur) => {
      const byId = new Map(cur.filter((m) => !m.id.startsWith("temp-")).map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      // Keep any still-sending optimistic messages at the end.
      const pending = cur.filter((m) => m.id.startsWith("temp-"));
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).concat(pending);
    });
  }, []);

  const markRead = useCallback(
    () => sb().rpc("mark_conversation_read", { p_conversation: conversationId }),
    [conversationId, sb],
  );

  // Opening the chat reads it; then refresh the server-rendered nav so
  // the Messages badge drops this conversation right away.
  useEffect(() => {
    void markRead().then(() => router.refresh());
  }, [markRead, router]);

  // Realtime + fallback poll.
  useEffect(() => {
    const client = sb();
    const channel = client
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          merge([payload.new as ChatMessage]);
          void markRead();
        },
      )
      .subscribe();

    const poll = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await client.rpc("conversation_messages", { p_conversation: conversationId, p_limit: 20 });
      if (data) {
        merge(data as ChatMessage[]);
        // Anything that arrived while you're looking at the chat is read.
        void markRead();
      }
    }, 10000);

    return () => {
      clearInterval(poll);
      void client.removeChannel(channel);
    };
  }, [conversationId, merge, markRead, sb]);

  // Stick to the bottom as messages arrive.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const temp: ChatMessage = { id: `temp-${Date.now()}`, sender_id: me.id, body, created_at: new Date().toISOString() };
    setMessages((cur) => [...cur, temp]);
    setDraft("");
    const { data, error: err } = await sb().rpc("send_message", { p_conversation: conversationId, p_body: body });
    setMessages((cur) => cur.filter((m) => m.id !== temp.id));
    if (err || !data) {
      setDraft(body);
      setError(
        err?.message.includes("rate_limited")
          ? "You're sending messages too fast. Wait a moment."
          : err?.message.includes("blocked")
            ? "You can't message this person."
            : "Couldn't send. Try again.",
      );
    } else {
      merge([{ id: data as string, sender_id: me.id, body, created_at: temp.created_at }]);
    }
    setSending(false);
  }

  async function loadOlder() {
    const oldest = messages.find((m) => !m.id.startsWith("temp-"));
    if (!oldest) return;
    const { data } = await sb().rpc("conversation_messages", {
      p_conversation: conversationId,
      p_before: oldest.created_at,
      p_limit: 50,
    });
    const older = (data ?? []) as ChatMessage[];
    if (older.length < 50) setOlderDone(true);
    merge(older);
  }

  const title = conversationTitle(others);

  return (
    <>
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border px-3 py-2.5 md:px-5 md:py-4">
        <Link href="/app/messages" aria-label="Back to messages" className="flex h-10 w-10 items-center justify-center text-ink lg:hidden">
          <Icon name="arrowLeft" className="h-6 w-6" />
        </Link>
        <ConversationAvatar others={others} size={40} />
        <div className="min-w-0 flex-1">
          {others.length === 1 ? (
            <Link href={`/app/u/${others[0].id}`} className="block truncate text-base font-bold text-ink hover:underline">
              {title}
            </Link>
          ) : (
            <p className="truncate text-base font-bold text-ink">{title}</p>
          )}
          {kind === "intro" && introId && (
            <Link href={`/app/intros/${introId}`} className="text-xs font-semibold text-muted hover:text-ink">
              Intro group chat · view intro
            </Link>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-5">
        {!olderDone && (
          <div className="mb-4 flex justify-center">
            <button type="button" onClick={loadOlder} className="text-xs font-semibold text-link hover:underline">
              Load earlier messages
            </button>
          </div>
        )}
        <ul className="flex flex-col gap-1">
          {messages.map((m, i) => {
            if (m.sender_id === null) {
              return (
                <li key={m.id} className="my-3 text-center text-xs font-semibold text-muted">
                  {m.body}
                </li>
              );
            }
            const mine = m.sender_id === me.id;
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const firstOfRun = !prev || prev.sender_id !== m.sender_id;
            const lastOfRun = !next || next.sender_id !== m.sender_id;
            const sender = people.get(m.sender_id);
            const showName = !mine && firstOfRun && others.length > 1;
            const gap = prev && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 30 * 60000;
            return (
              <li key={m.id} className={firstOfRun ? "mt-2" : ""}>
                {gap && (
                  <p className="my-3 text-center text-[11px] font-semibold text-muted">
                    {new Date(m.created_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                  </p>
                )}
                <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && (
                    <span className="w-7 shrink-0">
                      {lastOfRun && sender && (
                        <Avatar id={sender.id} name={sender.full_name} src={sender.avatar_url} size={28} />
                      )}
                    </span>
                  )}
                  <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                    {showName && sender && (
                      <span className="mb-0.5 ml-3 text-[11px] font-semibold text-muted">{sender.full_name.split(" ")[0]}</span>
                    )}
                    <p
                      className={`whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-2 text-[15px] leading-snug ${
                        mine ? "bg-bubble text-white" : "bg-fill text-ink"
                      } ${m.id.startsWith("temp-") ? "opacity-60" : ""}`}
                    >
                      {m.body}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        className="border-t border-border px-3 py-3 md:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {error && <p className="mb-2 text-xs text-danger">{error}</p>}
        <div className="flex items-end gap-2 rounded-[22px] border border-border-strong bg-surface py-1.5 pl-4 pr-1.5 focus-within:border-link">
          <label htmlFor="message" className="sr-only">
            Message
          </label>
          <textarea
            id="message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter adds a line.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Message…"
            className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[15px] text-ink placeholder:text-muted focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="h-9 shrink-0 rounded-pill px-3 text-sm font-bold text-link disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </>
  );
}
