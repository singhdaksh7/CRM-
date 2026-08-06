// Phase 4, Objective 14 - PWA service worker. Hand-written, no next-pwa/
// serwist dependency (their Webpack-plugin integration is awkward with
// recent Next/App Router versions, and this app needs neither offline data
// nor mutations - just an installable shell + basic static-asset caching).
//
// Scope: cache-first for _next/static (content-hashed, safe to cache
// aggressively) and the app icons/manifest; network-only for everything
// else, including all /api routes (which already send
// Cache-Control: no-store - this worker must not contradict that) and HTML
// navigation (no offline data mutations, no stale dashboard data served).
// Offline navigation falls back to a minimal static shell page.
//
// PUSH-READY, NOT PUSH-IMPLEMENTED (Change 14): the install/activate/fetch
// handlers below are deliberately kept in separate, clearly-labeled
// sections so a future `push` / `notificationclick` listener can be added
// without restructuring this file. No subscription endpoint, no VAPID
// keys, no PushSubscription persistence exist yet - do not add a `push`
// listener until that backend work lands.

const CACHE_NAME = "broker-crm-shell-v1";
const SHELL_URLS = ["/offline.html", "/manifest.webmanifest"];

// --- install ---------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

// --- activate ----------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// --- fetch -------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return; // never intercept mutations

  // API routes: always network, never cached (matches the existing
  // Cache-Control: no-store on /api/:path* in next.config.ts).
  if (url.pathname.startsWith("/api/")) return;

  // Static, content-hashed Next.js assets: cache-first, runtime-cached as
  // fetched (content hashes are unpredictable at build time under Webpack,
  // so a precache manifest isn't viable here - runtime caching is the
  // simplest correct approach).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // HTML navigation: network-first, falling back to a minimal offline page
  // when truly offline - never stale application data.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html").then((r) => r || Response.error()))
    );
  }
});

// --- push (NOT implemented - see file header) -------------------------------
// self.addEventListener("push", (event) => { ... });
// self.addEventListener("notificationclick", (event) => { ... });
