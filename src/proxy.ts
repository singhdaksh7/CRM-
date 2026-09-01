import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccess } from "@/lib/permissions";
import { withTiming } from "@/lib/perf";
import { performanceDiagnosticsEnabled } from "@/lib/performance-diagnostics";

const authenticatedProxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/setup-account/") ||
    pathname.startsWith("/api/account-setup/") ||
    // Employee auth lifecycle: a signed-out employee must be able to ask for
    // a reset and to open the link they were sent on WhatsApp.
    pathname === "/forgot-password" ||
    pathname === "/api/forgot-password" ||
    pathname.startsWith("/reset-password/") ||
    pathname.startsWith("/api/password-reset/") ||
    pathname.startsWith("/p/") ||
    pathname.startsWith("/share/catalogue/") ||
    pathname.startsWith("/api/catalogues/") ||
    pathname.startsWith("/api/integrations") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/system/health" ||
    pathname === "/api/system/readiness" ||
    // Vercel Cron (and manual/administrative triggers) call this without a
    // user session - it does its own CRON_SECRET bearer-token check inside
    // the route handler, same pattern as /api/integrations above.
    pathname === "/api/internal/notifications/sweep" ||
    // Phase 4 - PWA: browsers fetch the manifest, service worker, and app
    // icons unauthenticated (often before the user has ever logged in) -
    // these must never redirect to /login.
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/offline.html" ||
    pathname === "/icon" ||
    pathname === "/apple-icon" ||
    pathname.startsWith("/api/pwa/");

  if (isPublic) return NextResponse.next();

  if (pathname.startsWith("/internal/performance") || pathname.startsWith("/api/internal/performance")) {
    if (!performanceDiagnosticsEnabled() || !req.auth || req.auth.user.role !== "ADMIN") {
      return new NextResponse(null, { status: 404 });
    }
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  const role = req.auth.user.role;
  if (pathname.startsWith("/api")) return NextResponse.next();

  // Phase 4 - role-aware landing page. A Field Executive visiting the
  // shared /dashboard (e.g. an old bookmark) bounces onward to their own
  // dashboard rather than seeing the desktop-oriented shared one.
  const homePath = role === "FIELD_EXECUTIVE" ? "/executive-dashboard" : "/dashboard";
  if (role === "FIELD_EXECUTIVE" && pathname === "/dashboard") {
    return NextResponse.redirect(new URL(homePath, req.nextUrl.origin));
  }

  if (!canAccess(role, pathname)) {
    return NextResponse.redirect(new URL(homePath, req.nextUrl.origin));
  }

  return NextResponse.next();
});

/**
 * Temporary performance instrumentation. This measures the complete Auth.js
 * wrapper in proxy without inspecting session or request contents.
 */
export default async function proxy(
  req: Parameters<typeof authenticatedProxy>[0],
  event: Parameters<typeof authenticatedProxy>[1]
) {
  return withTiming("auth.proxy", "proxy", async () => await authenticatedProxy(req, event));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
