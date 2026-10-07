"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/app/components/avatar";
import { Icon } from "@/app/components/icons";
import { ReportDialog } from "@/app/components/report-dialog";
import { blockFromChat } from "@/app/components/moderation-actions";
import { ConversationAvatar, conversationTitle, type Person } from "../inbox";

export type ChatMessage = {
  id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  image_path?: string | null;
  unsent?: boolean;
};

// Realtime rows carry raw columns (unsent_at), not the RPC's shape.
type RawRow = ChatMessage & { unsent_at?: string | null };
const fromRow = (r: RawRow): ChatMessage => ({
  id: r.id,
  sender_id: r.sender_id,
  body: r.body,
  created_at: r.created_at,
  image_path: r.image_path ?? null,
  unsent: r.unsent ?? !!r.unsent_at,
});

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// Live chat: new messages, unsends and read state arrive over Supabase
// Realtime, with a quiet poll as a fallback. Sends are optimistic.
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
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [readState, setReadState] = useState<Record<string, string>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [msgMenu, setMsgMenu] = useState<string | null>(null);
  const [reporting, setReporting] = useState<{ kind: "user" | "message"; id: string; what: string } | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const people = new Map([me, ...others].map((p) => [p.id, p]));

  const sb = useCallback(() => (supabaseRef.current ??= createClient()), []);

  const merge = useCallback((incoming: ChatMessage[]) => {
    setMessages((cur) => {
      const byId = new Map(cur.filter((m) => !m.id.startsWith("temp-")).map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      const pending = cur.filter((m) => m.id.startsWith("temp-"));
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).concat(pending);
    });
  }, []);

  const markRead = useCallback(
    () => sb().rpc("mark_conversation_read", { p_conversation: conversationId }),
    [conversationId, sb],
  );

  const loadReadState = useCallback(async () => {
    const { data } = await sb().rpc("conversation_read_state", { p_conversation: conversationId });
    if (data) {
      setReadState(Object.fromEntries((data as { user_id: string; last_read_at: string }[]).map((r) => [r.user_id, r.last_read_at])));
    }
  }, [conversationId, sb]);

  // Opening the chat reads it; then refresh the server-rendered nav so the
  // Messages badge drops this conversation right away.
  useEffect(() => {
    void markRead().then(() => {
      router.refresh();
      return loadReadState();
    });
  }, [markRead, loadReadState, router]);

  // Signed URLs for photos (private bucket), fetched in batches.
  useEffect(() => {
    const missing = messages
      .map((m) => m.image_path)
      .filter((p): p is string => !!p && !imageUrls[p] && !p.startsWith("blob:"));
    if (missing.length === 0) return;
    let cancelled = false;
    void sb()
      .storage.from("chat-images")
      .createSignedUrls(missing, 60 * 60)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setImageUrls((cur) => {
          const next = { ...cur };
          for (const d of data) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [messages, imageUrls, sb]);

  // Realtime + fallback poll.
  useEffect(() => {
    const client = sb();
    const channel = client
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const gone = (payload.old as { id?: string }).id;
            if (gone) setMessages((cur) => cur.filter((m) => m.id !== gone));
            return;
          }
          merge([fromRow(payload.new as RawRow)]);
          void markRead();
        },
      )
      .subscribe();

    const poll = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await client.rpc("conversation_messages", { p_conversation: conversationId, p_limit: 20 });
      if (data) {
        merge((data as RawRow[]).map(fromRow));
        void markRead();
      }
      void loadReadState();
    }, 10000);

    return () => {
      clearInterval(poll);
      void client.removeChannel(channel);
    };
  }, [conversationId, merge, markRead, loadReadState, sb]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function sendError(message?: string) {
    return message?.includes("rate_limited")
      ? "You're sending messages too fast. Wait a moment."
      : message?.includes("blocked")
        ? "You can't message this person."
        : "Couldn't send. Try again.";
  }

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
      setError(sendError(err?.message));
    } else {
      merge([{ id: data as string, sender_id: me.id, body, created_at: temp.created_at }]);
    }
    setSending(false);
  }

  async function sendPhoto(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("That isn't a photo.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("That photo is too big (10 MB max).");
      return;
    }
    setSending(true);
    setError(null);
    const preview = URL.createObjectURL(file);
    const temp: ChatMessage = {
      id: `temp-${Date.now()}`,
      sender_id: me.id,
      body: "",
      created_at: new Date().toISOString(),
      image_path: preview,
    };
    setImageUrls((cur) => ({ ...cur, [preview]: preview }));
    setMessages((cur) => [...cur, temp]);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${conversationId}/${crypto.randomUUID()}.${ext}`;
    const client = sb();
    const up = await client.storage.from("chat-images").upload(path, file, { contentType: file.type, upsert: false });
    let failed = !!up.error;
    let saved: string | null = null;
    if (!failed) {
      const { data, error: err } = await client.rpc("send_message", {
        p_conversation: conversationId,
        p_body: "",
        p_image_path: path,
      });
      failed = !!err || !data;
      saved = (data as string) ?? null;
      if (err) setError(sendError(err.message));
    } else {
      setError("Couldn't upload the photo. Try again.");
    }
    setMessages((cur) => cur.filter((m) => m.id !== temp.id));
    if (!failed && saved) {
      setImageUrls((cur) => ({ ...cur, [path]: preview }));
      merge([{ id: saved, sender_id: me.id, body: "", created_at: temp.created_at, image_path: path }]);
    }
    setSending(false);
  }

  async function unsend(id: string) {
    setMsgMenu(null);
    const before = messages;
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, body: "", image_path: null, unsent: true } : m)));
    const { error: err } = await sb().rpc("unsend_message", { p_message: id });
    if (err) {
      setMessages(before);
      setError("Couldn't unsend that message.");
    }
  }

  async function loadOlder() {
    const oldest = messages.find((m) => !m.id.startsWith("temp-"));
    if (!oldest) return;
    const { data } = await sb().rpc("conversation_messages", {
      p_conversation: conversationId,
      p_before: oldest.created_at,
      p_limit: 50,
    });
    const older = ((data ?? []) as RawRow[]).map(fromRow);
    if (older.length < 50) setOlderDone(true);
    merge(older);
  }

  const title = conversationTitle(others);
  const direct = kind === "direct" && others.length === 1 ? others[0] : null;

  // "Seen" goes under my newest message that someone else has read.
  const mine = messages.filter((m) => m.sender_id === me.id && !m.id.startsWith("temp-"));
  const lastMine = mine[mine.length - 1];
  const seenBy = lastMine
    ? others.filter((o) => readState[o.id] && readState[o.id] >= lastMine.created_at).map((o) => o.full_name.split(" ")[0])
    : [];

  return (
    <>
      {/* Header */}
      <header className="relative flex items-center gap-3 border-b border-border px-3 py-2.5 md:px-5 md:py-4">
        <Link href="/app/messages" aria-label="Back to messages" className="flex h-10 w-10 items-center justify-center text-ink lg:hidden">
          <Icon name="arrowLeft" className="h-6 w-6" />
        </Link>
        <ConversationAvatar others={others} size={40} />
        <div className="min-w-0 flex-1">
          {direct ? (
            <Link href={`/app/u/${direct.id}`} className="block truncate text-base font-bold text-ink hover:underline">
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
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Chat options"
          aria-expanded={menuOpen}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-fill"
        >
          <Icon name="more" className="h-6 w-6" />
        </button>
        {menuOpen && (
          <>
            <button type="button" aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} />
            <div role="menu" className="absolute right-3 top-[calc(100%-4px)] z-20 w-60 rounded-card border border-border bg-surface p-1.5 shadow-elevated">
              {others.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setReporting({ kind: "user", id: o.id, what: o.full_name.split(" ")[0] });
                  }}
                  className="flex w-full items-center gap-3 rounded-input px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-fill"
                >
                  <Icon name="flag" className="h-4 w-4" /> Report {others.length > 1 ? o.full_name.split(" ")[0] : ""}
                </button>
              ))}
              {direct && (
                <form
                  action={blockFromChat}
                  onSubmit={(e) => {
                    if (!confirm(`Block ${direct.full_name.split(" ")[0]}? They won't be able to message you.`)) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="person_id" value={direct.id} />
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-3 rounded-input px-3 py-2.5 text-left text-sm font-semibold text-danger hover:bg-fill"
                  >
                    <Icon name="block" className="h-4 w-4" /> Block {direct.full_name.split(" ")[0]}
                  </button>
                </form>
              )}
            </div>
          </>
        )}
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
            const isMine = m.sender_id === me.id;
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const firstOfRun = !prev || prev.sender_id !== m.sender_id;
            const lastOfRun = !next || next.sender_id !== m.sender_id;
            const sender = people.get(m.sender_id);
            const showName = !isMine && firstOfRun && others.length > 1;
            const gap = prev && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 30 * 60000;
            const pending = m.id.startsWith("temp-");
            const img = m.image_path ? imageUrls[m.image_path] : null;
            return (
              <li key={m.id} className={firstOfRun ? "mt-2" : ""}>
                {gap && (
                  <p className="my-3 text-center text-[11px] font-semibold text-muted">
                    {new Date(m.created_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                  </p>
                )}
                <div className={`group flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                  {!isMine && (
                    <span className="w-7 shrink-0">
                      {lastOfRun && sender && <Avatar id={sender.id} name={sender.full_name} src={sender.avatar_url} size={28} />}
                    </span>
                  )}
                  {/* Message actions: Unsend (yours) / Report (theirs) */}
                  {!pending && !m.unsent && (
                    <div className={`relative ${isMine ? "order-first" : "order-last"}`}>
                      <button
                        type="button"
                        aria-label="Message options"
                        onClick={() => setMsgMenu((cur) => (cur === m.id ? null : m.id))}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted opacity-100 hover:bg-fill hover:text-ink md:opacity-0 md:group-hover:opacity-100"
                      >
                        <Icon name="more" className="h-4 w-4" />
                      </button>
                      {msgMenu === m.id && (
                        <>
                          <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={() => setMsgMenu(null)} />
                          <div
                            role="menu"
                            className={`absolute bottom-8 z-20 w-36 rounded-input border border-border bg-surface p-1 shadow-elevated ${isMine ? "right-0" : "left-0"}`}
                          >
                            {isMine ? (
                              <button type="button" role="menuitem" onClick={() => unsend(m.id)} className="w-full rounded-[10px] px-3 py-2 text-left text-sm font-semibold text-danger hover:bg-fill">
                                Unsend
                              </button>
                            ) : (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setMsgMenu(null);
                                  setReporting({ kind: "message", id: m.id, what: "this message" });
                                }}
                                className="w-full rounded-[10px] px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-fill"
                              >
                                Report
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <div className={`flex max-w-[78%] flex-col ${isMine ? "items-end" : "items-start"}`}>
                    {showName && sender && (
                      <span className="mb-0.5 ml-3 text-[11px] font-semibold text-muted">{sender.full_name.split(" ")[0]}</span>
                    )}
                    {m.unsent ? (
                      <p className="rounded-[20px] border border-border px-3.5 py-2 text-sm italic text-muted">
                        {isMine ? "You unsent a message" : "Message unsent"}
                      </p>
                    ) : (
                      <>
                        {m.image_path && (
                          <button
                            type="button"
                            onClick={() => img && setViewer(img)}
                            className={`overflow-hidden rounded-[18px] border border-border bg-fill ${pending ? "opacity-60" : ""}`}
                            aria-label="Open photo"
                          >
                            {img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={img} alt="Photo" className="max-h-72 w-auto max-w-[260px] object-cover" />
                            ) : (
                              <span className="block h-48 w-52 animate-pulse" />
                            )}
                          </button>
                        )}
                        {m.body && (
                          <p
                            className={`mt-0.5 whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-2 text-[15px] leading-snug ${
                              isMine ? "bg-bubble text-white" : "bg-fill text-ink"
                            } ${pending ? "opacity-60" : ""}`}
                          >
                            {m.body}
                          </p>
                        )}
                      </>
                    )}
                    {lastMine && m.id === lastMine.id && seenBy.length > 0 && (
                      <span className="mr-2 mt-0.5 text-[11px] font-semibold text-muted">
                        {direct ? "Seen" : `Seen by ${seenBy.join(", ")}`}
                      </span>
                    )}
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
        <div className="flex items-end gap-2 rounded-[22px] border border-border-strong bg-surface py-1.5 pl-1.5 pr-1.5 focus-within:border-link">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            aria-label="Send a photo"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink hover:bg-fill disabled:opacity-40"
          >
            <Icon name="image" className="h-5 w-5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void sendPhoto(f);
            }}
          />
          <label htmlFor="message" className="sr-only">
            Message
          </label>
          <textarea
            id="message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
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

      {reporting && (
        <ReportDialog
          target={reporting.kind === "user" ? { kind: "user", reportedId: reporting.id } : { kind: "message", messageId: reporting.id }}
          what={reporting.what}
          onClose={() => setReporting(null)}
        />
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Photo">
          <button type="button" aria-label="Close photo" onClick={() => setViewer(null)} className="absolute inset-0" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer} alt="Photo" className="relative max-h-full max-w-full rounded-input object-contain" />
          <button
            type="button"
            onClick={() => setViewer(null)}
            aria-label="Close"
            className="absolute right-4 top-[calc(16px+env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}
