import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccess } from "@/lib/permissions";

export default auth((req) => {
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
    pathname === "/api/health" ||
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

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  const role = req.auth.user.role;
  // Demand Pool is retired. Preserve old bookmarks with a meaningful
  // destination, while retiring its dedicated API surface without deleting
  // legacy customer/requirement data or shared matching tables.
  if (pathname === "/customers" || pathname.startsWith("/customers/")) {
    return NextResponse.redirect(new URL("/leads", req.nextUrl.origin));
  }
  if (pathname === "/reports/demand") {
    return NextResponse.redirect(new URL("/reports", req.nextUrl.origin));
  }
  if (pathname.startsWith("/api/customers") || pathname.startsWith("/api/recommendations") || /^\/api\/properties\/[^/]+\/matches$/.test(pathname)) {
    return NextResponse.json({ error: "Demand Pool has been retired. Use Leads and Lead Requirements instead." }, { status: 410 });
  }
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
