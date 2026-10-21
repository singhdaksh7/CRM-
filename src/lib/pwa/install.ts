/**
 * Pure helpers for the "Install KP CRM" experience: platform/browser
 * detection, standalone detection and install-banner snooze logic. Kept free
 * of React and of direct `window` access so every branch is unit-testable in
 * the node test environment.
 */

export type InstallPlatform = "ios" | "android" | "windows" | "mac" | "other";
export type InstallBrowser = "safari" | "chrome" | "edge" | "firefox" | "samsung" | "other";

export interface InstallEnv {
  platform: InstallPlatform;
  browser: InstallBrowser;
  /** Running as an installed app (standalone / minimal-ui / iOS home-screen). */
  standalone: boolean;
}

export interface EnvInputs {
  userAgent: string;
  /** navigator.platform (legacy, used only to spot iPadOS reporting as a Mac). */
  platform?: string;
  maxTouchPoints?: number;
}

export function detectPlatform({ userAgent, platform = "", maxTouchPoints = 0 }: EnvInputs): InstallPlatform {
  const ua = userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS 13+ sends a desktop-Mac user agent; only touch support tells it apart.
  if (/Macintosh|MacIntel/i.test(ua + " " + platform) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  return "other";
}

export function detectBrowser(userAgent: string): InstallBrowser {
  const ua = userAgent;
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Edg(e|A|iOS)?\//i.test(ua)) return "edge";
  if (/FxiOS|Firefox/i.test(ua)) return "firefox";
  if (/CriOS|Chrome|Chromium/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua)) return "safari";
  return "other";
}

export interface StandaloneInputs {
  matchesStandalone: boolean;
  /** iOS Safari's non-standard navigator.standalone. */
  navigatorStandalone?: boolean;
}

export function isStandalone({ matchesStandalone, navigatorStandalone }: StandaloneInputs): boolean {
  return matchesStandalone || navigatorStandalone === true;
}

/** Whether this browser can ever show a native install prompt (beforeinstallprompt). */
export function supportsNativePrompt(env: Pick<InstallEnv, "platform" | "browser">): boolean {
  if (env.platform === "ios") return false;
  return env.browser === "chrome" || env.browser === "edge" || env.browser === "samsung";
}

// --- install banner snooze --------------------------------------------------

export const BANNER_DISMISSED_KEY = "kp-crm-install-banner-dismissed-at";
export const BANNER_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Storage can throw (private mode, blocked site data) - treat that as "not dismissed". */
export function isBannerSnoozed(store: KeyValueStore | null, now: number): boolean {
  if (!store) return false;
  try {
    const raw = store.getItem(BANNER_DISMISSED_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && now - at < BANNER_SNOOZE_MS;
  } catch {
    return false;
  }
}

export function snoozeBanner(store: KeyValueStore | null, now: number): void {
  if (!store) return;
  try {
    store.setItem(BANNER_DISMISSED_KEY, String(now));
  } catch {
    // Best effort: the banner just reappears next session.
  }
}

export interface BannerInputs {
  env: InstallEnv | null;
  canPrompt: boolean;
  installed: boolean;
  snoozed: boolean;
  pathname: string;
}

/**
 * The banner is shown only where it can do something useful: a native prompt
 * is available, or the user is on iOS (where the button leads to the
 * instructions). Never when installed, snoozed, or already on the install page.
 */
export function shouldShowBanner({ env, canPrompt, installed, snoozed, pathname }: BannerInputs): boolean {
  if (!env || env.standalone || installed || snoozed) return false;
  if (pathname.startsWith("/settings/install")) return false;
  return canPrompt || env.platform === "ios";
}
