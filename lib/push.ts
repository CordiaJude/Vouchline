import "server-only";
import webpush from "web-push";

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:support@vouchline.app";

export const pushConfigured = !!(PUBLIC && PRIVATE);
if (pushConfigured) webpush.setVapidDetails(SUBJECT, PUBLIC!, PRIVATE!);

export type PushPayload = { title: string; body: string; url: string; tag?: string };
export type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

// Sends to one device. Returns "gone" when the browser has dropped the
// subscription (uninstalled, permission revoked) so the caller can delete it.
export async function sendPush(sub: Subscription, payload: PushPayload): Promise<"ok" | "gone" | "error"> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 },
    );
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("[push] send failed", status, (err as Error).message);
    return "error";
  }
}
