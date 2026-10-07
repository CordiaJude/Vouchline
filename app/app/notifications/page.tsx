import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markReadAndGo, markAllRead } from "./actions";
import { heading1, mutedText, cardOutlined, pillAccent, btnSecondarySmall } from "@/app/components/ui/styles";
import { LoadError, loadErrors } from "@/app/components/load-error";

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function NotificationsPage() {
  const pageErrors: string[] = [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const loaded1 = await supabase.rpc("my_notifications");
  pageErrors.push(...loadErrors(loaded1));
  const { data } = loaded1;
  const notifications = (data ?? []) as Notification[];
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <>
      <LoadError errors={pageErrors} className="mx-4 mt-4" />
      <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
        <div className="w-full max-w-2xl">
          <div className="flex items-center justify-between">
            <h1 className={heading1}>Notifications</h1>
            {unreadCount > 0 && (
              <form action={markAllRead}>
                <button type="submit" className={btnSecondarySmall}>
                  Mark all read
                </button>
              </form>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className={`${mutedText} mt-6`}>
              Nothing yet. Connection confirmations and intro updates show
              up here.
            </p>
          ) : (
            <ul className="mt-6 flex flex-col gap-2">
              {notifications.map((n) => {
                const content = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{n.title}</p>
                      {!n.read_at && <span className={pillAccent}>New</span>}
                    </div>
                    {n.body && <p className={`${mutedText} mt-1`}>{n.body}</p>}
                    <p className="mt-1 font-label text-[12px] text-muted">
                      {timeAgo(n.created_at)}
                    </p>
                  </>
                );

                if (n.read_at) {
                  return (
                    <li key={n.id}>
                      {n.link ? (
                        <Link href={n.link} className={`${cardOutlined} block`}>
                          {content}
                        </Link>
                      ) : (
                        <div className={cardOutlined}>{content}</div>
                      )}
                    </li>
                  );
                }

                return (
                  <li key={n.id}>
                    <form action={markReadAndGo}>
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="link" value={n.link ?? ""} />
                      <button type="submit" className={`${cardOutlined} block w-full text-left`}>
                        {content}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
