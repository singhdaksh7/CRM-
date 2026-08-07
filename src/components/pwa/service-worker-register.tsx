"use client";

import { useEffect } from "react";

/**
 * Phase 4, Objective 14 - registers public/sw.js. Production-only and
 * guarded so dev's Fast Refresh / HMR is never disrupted by a stale
 * cached worker intercepting requests.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability degrades gracefully - the app works fully without
      // the service worker, it just loses the offline shell/asset caching.
    });
  }, []);

  return null;
}
