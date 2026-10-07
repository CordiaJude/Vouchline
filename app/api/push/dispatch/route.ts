import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfigured, sendPush, type Subscription } from "@/lib/push";
import { isQuietHoursNow, type QuietHoursSettings } from "@/lib/quiet-hours";

// Called by the database (private.dispatch_push, migration 0045) when a
// notification or chat message is created. Authenticated with a shared
// secret, never by users.
export async function POST(req: Request) {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (!secret || req.headers.get("x-push-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured) return NextResponse.json({ sent: 0, reason: "not_configured" });

  const body = (await req.json().catch(() => null)) as {
    user_ids?: string[];
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
  } | null;
  const userIds = (body?.user_ids ?? []).filter((u) => typeof u === "string").slice(0, 50);
  if (!body?.title || userIds.length === 0) return NextResponse.json({ sent: 0 });

  const admin = createAdminClient();
  const [{ data: subs }, { data: profiles }] = await Promise.all([
    admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds),
    admin
      .from("profiles")
      .select("id, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone")
      .in("id", userIds),
  ]);

  // Respect each person's quiet hours.
  const quiet = new Set(
    ((profiles ?? []) as (QuietHoursSettings & { id: string })[]).filter((p) => isQuietHoursNow(p)).map((p) => p.id),
  );
  const payload = {
    title: body.title.slice(0, 120),
    body: (body.body ?? "").slice(0, 240),
    url: body.url?.startsWith("/") ? body.url : "/app",
    tag: body.tag,
  };

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    ((subs ?? []) as (Subscription & { user_id: string })[])
      .filter((s) => !quiet.has(s.user_id))
      .map(async (s) => {
        const r = await sendPush(s, payload);
        if (r === "ok") sent++;
        if (r === "gone") gone.push(s.id);
      }),
  );
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  return NextResponse.json({ sent });
}
