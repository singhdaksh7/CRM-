import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./src/lib/csp";

// Phase 3J - production security headers. Applied via Next's built-in
// header injection (works for both `next dev` and `next start`/Docker), not
// application code, so every route gets these without per-route wiring.
//
// When STORAGE_PROVIDER=R2, connect-src / img-src also allow the configured
// R2 S3 API origin so browser direct/presigned uploads and signed image loads
// are not blocked. Origin is derived from R2_ENDPOINT (or R2_ACCOUNT_ID) -
// never from request input. See src/lib/csp.ts. Requires R2_* env available
// at `next build` (Vercel Production env) so the header is baked correctly.

function buildSecurityHeaders() {
  return [
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "X-DNS-Prefetch-Control", value: "on" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(process.env) },
  ];
}

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  async headers() {
    return [
      { source: "/:path*", headers: buildSecurityHeaders() },
      // API responses may contain PII/financial data - never let a browser
      // or intermediate proxy cache them. Public catalogue/webhook routes
      // are momentary/write-mostly and equally shouldn't be cached.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
