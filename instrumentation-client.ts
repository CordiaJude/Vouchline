import * as Sentry from "@sentry/nextjs";

// This Next.js version replaces sentry.client.config.ts with the
// instrumentation-client.ts file convention -- see
// node_modules/next/dist/docs/.../instrumentation-client.md.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}
