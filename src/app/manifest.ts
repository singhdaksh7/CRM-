import type { MetadataRoute } from "next";

/**
 * Phase 4, Objective 14 - PWA manifest. start_url is /dashboard (the
 * manifest spec has no role-aware start_url) - the role-aware login
 * redirect (src/app/login/page.tsx, src/proxy.ts) bounces a Field
 * Executive to /executive-dashboard after that first load, same as any
 * other navigation. The manifest holds no user data or credentials and is
 * served unauthenticated (browsers fetch it before sign-in); opening the
 * installed app still goes through the normal auth redirect.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "KP Properties CRM",
    short_name: "KP CRM",
    description: "Real-estate broker CRM & property inventory management",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    categories: ["business", "productivity"],
    background_color: "#FAFAFA",
    theme_color: "#0A0A0A",
    icons: [
      { src: "/api/pwa/icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/pwa/icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/pwa/icon?size=512&maskable=true", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
