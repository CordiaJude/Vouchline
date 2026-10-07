import Link from "next/link";
import { Avatar } from "@/app/components/avatar";

export type Person = { id: string; full_name: string; avatar_url: string | null };
export type ConversationRow = {
  id: string;
  kind: "intro" | "direct";
  intro_id: string | null;
  last_message_at: string;
  last_body: string | null;
  last_sender_id: string | null;
  unread_count: number;
  others: Person[];
};

export function conversationTitle(others: Person[]): string {
  if (others.length === 0) return "Just you";
  if (others.length === 1) return others[0].full_name;
  return others.map((p) => p.full_name.split(" ")[0]).join(", ");
}

export function timeShort(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Overlapping avatars for group (intro) chats, a single one otherwise.
export function ConversationAvatar({ others, size = 56 }: { others: Person[]; size?: 56 | 40 }) {
  if (others.length <= 1) {
    const p = others[0];
    return p ? <Avatar id={p.id} name={p.full_name} src={p.avatar_url} size={size} /> : null;
  }
  const small = size === 56 ? 40 : 28;
  return (
    <span className={`relative shrink-0 ${size === 56 ? "h-14 w-14" : "h-10 w-10"}`}>
      <span className="absolute right-0 top-0">
        <Avatar id={others[0].id} name={others[0].full_name} src={others[0].avatar_url} size={small} />
      </span>
      <span className="absolute bottom-0 left-0 rounded-full bg-page p-[2px]">
        <Avatar id={others[1].id} name={others[1].full_name} src={others[1].avatar_url} size={small} />
      </span>
    </span>
  );
}

export function Inbox({
  conversations,
  meId,
  activeId,
}: {
  conversations: ConversationRow[];
  meId: string;
  activeId?: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <h1 className="px-4 pb-3 pt-4 text-xl font-extrabold tracking-tight text-ink md:pt-8">Messages</h1>
      {conversations.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-semibold text-ink">No messages yet</p>
          <p className="mt-1 text-sm text-muted">
            When an intro is accepted, a group chat opens here. You can also message any of your connections from
            their profile.
          </p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto pb-4">
          {conversations.map((c) => {
            const unread = c.unread_count > 0;
            const preview =
              c.last_body == null
                ? ""
                : c.last_sender_id === meId
                  ? `You: ${c.last_body}`
                  : c.last_body;
            return (
              <li key={c.id}>
                <Link
                  href={`/app/messages/${c.id}`}
                  aria-current={activeId === c.id ? "page" : undefined}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-fill ${
                    activeId === c.id ? "bg-fill" : ""
                  }`}
                >
                  <ConversationAvatar others={c.others} />
                  <span className="min-w-0 flex-1">
                    <span className={`flex items-center gap-1.5 text-sm text-ink ${unread ? "font-bold" : "font-medium"}`}>
                      <span className="truncate">{conversationTitle(c.others)}</span>
                      {c.kind === "intro" && (
                        <span className="shrink-0 rounded-pill bg-fill px-1.5 py-px text-[10px] font-semibold text-muted">
                          Intro
                        </span>
                      )}
                    </span>
                    <span className={`flex gap-1 text-sm ${unread ? "font-semibold text-ink" : "text-muted"}`}>
                      <span className="truncate">{preview}</span>
                      <span className="shrink-0 text-muted">· {timeShort(c.last_message_at)}</span>
                    </span>
                  </span>
                  {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-link" aria-label="Unread" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
