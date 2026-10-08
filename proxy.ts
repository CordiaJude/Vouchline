import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// CSP lives here, not in next.config.ts: a static header can't carry a
// nonce, and without one, the browser blocks Next's own inline
// __next_f.push(...) RSC hydration payload scripts under a strict
// script-src 'self' -- every client-rendered page silently fails to
// hydrate. See node_modules/next/dist/docs/.../content-security-policy.md.
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' data: blob: https:;
    font-src 'self' data:;
    connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io;
    worker-src 'self';
    manifest-src 'self';
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Lets layouts send someone back where they were (e.g. after onboarding).
  requestHeaders.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
