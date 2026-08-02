import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccess } from "@/lib/permissions";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === "/login" ||
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
    pathname === "/api/internal/notifications/sweep";

  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  const role = req.auth.user.role;
  if (pathname.startsWith("/api")) return NextResponse.next();
  if (!canAccess(role, pathname)) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
