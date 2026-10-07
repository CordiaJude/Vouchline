import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// Content-Security-Policy is NOT set here: a static header can't carry a
// per-request nonce, and Next's own inline hydration scripts need one
// under a strict script-src. See proxy.ts, which generates it per request.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    // Resume import sends a PDF (up to 5 MB) through a server action;
    // the default cap is 1 MB.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// A no-op wrapper without SENTRY_AUTH_TOKEN set: it silently skips
// source-map upload rather than failing the build, so this is safe to
// apply unconditionally.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  telemetry: false,
});
