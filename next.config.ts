import type { NextConfig } from "next";

// Phase 3J - production security headers. Applied via Next's built-in
// header injection (works for both `next dev` and `next start`/Docker), not
// application code, so every route gets these without per-route wiring.
//
// CSP note: `script-src` includes 'unsafe-inline' because Next.js App
// Router injects a small inline bootstrap/hydration script on every page;
// tightening this to a nonce-based policy is a real follow-up (see
// SECURITY.md) but wasn't done here since it can't be visually verified
// without a browser in this environment, and a broken CSP would silently
// break the whole app's client-side interactivity.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https://images.unsplash.com",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: CSP },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses may contain PII/financial data - never let a browser
      // or intermediate proxy cache them. Public catalogue/webhook routes
      // are momentary/write-mostly and equally shouldn't be cached.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
