import * as Sentry from "@sentry/nextjs";

// This Next.js version replaces sentry.server.config.ts / sentry.edge.config.ts
// with a single instrumentation.ts register() hook, branched by runtime --
// see node_modules/next/dist/docs/.../instrumentation.md.
export async function register() {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Free-tier event volume: trace a small sample rather than everything.
    tracesSampleRate: 0.1,
  });
}

export const onRequestError = Sentry.captureRequestError;
