import type { MetadataRoute } from "next";

/**
 * Phase 4, Objective 14 - PWA manifest. start_url is /dashboard (the
 * manifest spec has no role-aware start_url) - the role-aware login
 * redirect (src/app/login/page.tsx, src/proxy.ts) bounces a Field
 * Executive to /executive-dashboard after that first load, same as any
 * other navigation.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Delhi Broker CRM",
    short_name: "Broker CRM",
    description: "Real-estate broker CRM & property inventory management",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#FAFBFC",
    theme_color: "#3366FF",
    icons: [
      { src: "/api/pwa/icon?size=192", sizes: "192x192", type: "image/png" },
      { src: "/api/pwa/icon?size=512", sizes: "512x512", type: "image/png" },
      { src: "/api/pwa/icon?size=512&maskable=true", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
