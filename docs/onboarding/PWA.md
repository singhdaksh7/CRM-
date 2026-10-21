# PWA / Install KP CRM

KP CRM is an installable Progressive Web App. Staff install it from **Install KP CRM** (sidebar footer, or `/settings/install`). It still needs an internet connection: there is **no offline data**.

## Architecture

| Piece | Location |
|---|---|
| Web App Manifest | `src/app/manifest.ts` (served at `/manifest.webmanifest`) |
| Service worker | `public/sw.js`, registered by `src/components/pwa/service-worker-register.tsx` (production only) |
| Offline fallback page | `public/offline.html` |
| Icons | generated PNGs from `src/app/api/pwa/icon/route.tsx` (`?size=192`, `?size=512`, `?size=512&maskable=true`); favicon `src/app/icon.tsx`; Apple touch icon `src/app/apple-icon.tsx` |
| iOS meta tags / theme colour | `src/app/layout.tsx` (`appleWebApp`, `viewport.themeColor`) |
| Install page | `src/app/(app)/settings/install/page.tsx` -> `src/components/pwa/install-guide.tsx` / `install-guide-view.tsx` |
| Install banner | `src/components/pwa/install-banner.tsx` (rendered in `src/app/(app)/layout.tsx`) |
| Detection + banner rules (pure, unit tested) | `src/lib/pwa/install.ts` |
| `beforeinstallprompt` store | `src/lib/pwa/install-store.ts`, initialised by `InstallStoreInit` in the root layout |
| Instruction copy | `src/lib/pwa/install-instructions.ts` |
| Tests | `src/lib/pwa/*.test.ts`, `src/components/pwa/install-guide.test.ts`, `src/app/manifest.test.ts` |

The icons are a "KP" monogram rendered at request time. No logo artwork exists in the repo; to use real artwork, replace the icon route (see the note in that file) and keep the three icon URLs referenced by the manifest.

## Manifest

`name: "KP Properties CRM"`, `short_name: "KP CRM"`, `display: standalone`, `start_url: /dashboard`, `scope: /`, theme `#0A0A0A`, background `#FAFAFA`. `start_url` is the same for every role; a Field Executive is bounced to `/executive-dashboard` by `src/proxy.ts`. The manifest contains no user data or credentials and is public (browsers fetch it before sign-in).

## Authentication

Installing does not bypass auth. Only the manifest, `sw.js`, `offline.html`, the icons and `/api/pwa/*` are public (`src/proxy.ts`). The installed app opens `/dashboard`, which redirects a signed-out user to `/login`. `/settings/install` is available to every signed-in role (`SELF_SERVICE_PATHS` in `src/lib/permissions.ts`) and re-checks the session itself.

## Service worker caching (deliberately minimal)

- Precache: `/offline.html`, `/manifest.webmanifest` only.
- Runtime cache: same-origin `GET /_next/static/*` (content-hashed build assets) only.
- **Never** intercepted: non-GET requests, cross-origin requests, anything under `/api/`.
- HTML navigations are network-only; the cached offline page is shown only if the network is down. Page HTML is never stored, because it contains customer data.
- `/api/*` also sends `Cache-Control: no-store` (`next.config.ts`).
- Do not add a route-specific cache or a `push` handler without a security review. `src/lib/pwa/service-worker.test.ts` runs the worker in a sandbox and fails if API/page responses get cached.
- Bump `CACHE_NAME` in `sw.js` when changing caching behaviour; old caches are deleted on activate.

## How install detection works

`install-store.ts` runs once on the client:

1. Reads platform/browser from the user agent (`detectPlatform` / `detectBrowser`; iPadOS reports as a Mac, so Mac + touch points means iOS).
2. Standalone = `display-mode: standalone | minimal-ui | window-controls-overlay` or iOS `navigator.standalone`.
3. Captures `beforeinstallprompt` (Chromium: Chrome, Edge, Samsung Internet) so the **Install KP CRM** button can call `prompt()`. It listens for `appinstalled`. The listener lives in the root layout because the event fires only once, early.

State is exposed with `useSyncExternalStore`, so server render and first client render match (`env` is `null` until detection runs, which shows all four device cards).

A browser tab cannot reliably know the app is installed on the device; the "installed" state shows when running standalone or after `appinstalled` in the same session.

The banner (`shouldShowBanner`) shows only when a native prompt exists or the device is iOS, never when installed/standalone or on the install page. "Not now" / X snoozes it for 30 days in `localStorage` (`kp-crm-install-banner-dismissed-at`); storage failures are tolerated.

## iOS limitations

Safari has no `beforeinstallprompt` and a website cannot trigger "Add to Home Screen". The page therefore shows Share-menu steps on iOS and never a JS install button. Other iOS browsers get a note recommending Safari. Mac Safari 17+ can use File -> Add to Dock; Firefox desktop cannot install web apps.

## Testing locally

```
npx vitest run src/lib/pwa src/components/pwa src/app/manifest.test.ts
npm run build && npm start    # needs an https NEXTAUTH_URL; see docs/browser-qa.md
```

The service worker registers only when `NODE_ENV=production`. For a real install test use a deployed HTTPS URL (or `localhost`), Chrome DevTools -> Application -> Manifest / Service Workers, and Lighthouse's PWA checks. Emulate iOS/Android in DevTools to see the other device cards, but real iOS installation can only be checked on a device.
