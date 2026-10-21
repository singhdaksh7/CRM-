import { describe, expect, it } from "vitest";
import {
  BANNER_DISMISSED_KEY,
  BANNER_SNOOZE_MS,
  detectBrowser,
  detectPlatform,
  isBannerSnoozed,
  isStandalone,
  shouldShowBanner,
  snoozeBanner,
  supportsNativePrompt,
  type InstallEnv,
  type KeyValueStore,
} from "./install";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
  winChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  winFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
};

describe("detectPlatform", () => {
  it("recognises each supported platform", () => {
    expect(detectPlatform({ userAgent: UA.iphoneSafari })).toBe("ios");
    expect(detectPlatform({ userAgent: UA.androidChrome })).toBe("android");
    expect(detectPlatform({ userAgent: UA.winChrome })).toBe("windows");
    expect(detectPlatform({ userAgent: UA.macSafari, platform: "MacIntel", maxTouchPoints: 0 })).toBe("mac");
    expect(detectPlatform({ userAgent: "curl/8" })).toBe("other");
  });

  it("treats an iPad reporting a desktop Mac user agent as iOS via touch points", () => {
    expect(detectPlatform({ userAgent: UA.macSafari, platform: "MacIntel", maxTouchPoints: 5 })).toBe("ios");
  });
});

describe("detectBrowser", () => {
  it("distinguishes Safari, Chrome, Edge, Firefox and Samsung", () => {
    expect(detectBrowser(UA.iphoneSafari)).toBe("safari");
    expect(detectBrowser(UA.macSafari)).toBe("safari");
    expect(detectBrowser(UA.iphoneChrome)).toBe("chrome");
    expect(detectBrowser(UA.androidChrome)).toBe("chrome");
    expect(detectBrowser(UA.macChrome)).toBe("chrome");
    expect(detectBrowser(UA.winEdge)).toBe("edge");
    expect(detectBrowser(UA.winFirefox)).toBe("firefox");
    expect(detectBrowser(UA.samsung)).toBe("samsung");
  });
});

describe("isStandalone", () => {
  it("detects display-mode standalone and iOS navigator.standalone", () => {
    expect(isStandalone({ matchesStandalone: true })).toBe(true);
    expect(isStandalone({ matchesStandalone: false, navigatorStandalone: true })).toBe(true);
    expect(isStandalone({ matchesStandalone: false, navigatorStandalone: false })).toBe(false);
    expect(isStandalone({ matchesStandalone: false })).toBe(false);
  });
});

describe("supportsNativePrompt", () => {
  it("is never true on iOS and only for Chromium-family browsers elsewhere", () => {
    expect(supportsNativePrompt({ platform: "ios", browser: "chrome" })).toBe(false);
    expect(supportsNativePrompt({ platform: "android", browser: "chrome" })).toBe(true);
    expect(supportsNativePrompt({ platform: "windows", browser: "edge" })).toBe(true);
    expect(supportsNativePrompt({ platform: "windows", browser: "firefox" })).toBe(false);
    expect(supportsNativePrompt({ platform: "mac", browser: "safari" })).toBe(false);
  });
});

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("install banner snooze", () => {
  const now = 1_800_000_000_000;

  it("is not snoozed on first visit, then snoozed after dismissal", () => {
    const store = memoryStore();
    expect(isBannerSnoozed(store, now)).toBe(false);
    snoozeBanner(store, now);
    expect(store.data[BANNER_DISMISSED_KEY]).toBe(String(now));
    expect(isBannerSnoozed(store, now + 1000)).toBe(true);
  });

  it("reappears once the snooze period has passed", () => {
    const store = memoryStore({ [BANNER_DISMISSED_KEY]: String(now) });
    expect(isBannerSnoozed(store, now + BANNER_SNOOZE_MS - 1)).toBe(true);
    expect(isBannerSnoozed(store, now + BANNER_SNOOZE_MS + 1)).toBe(false);
  });

  it("survives storage that throws or is unavailable", () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(isBannerSnoozed(broken, now)).toBe(false);
    expect(() => snoozeBanner(broken, now)).not.toThrow();
    expect(isBannerSnoozed(null, now)).toBe(false);
  });

  it("ignores a corrupt stored value", () => {
    expect(isBannerSnoozed(memoryStore({ [BANNER_DISMISSED_KEY]: "garbage" }), now)).toBe(false);
  });
});

describe("shouldShowBanner", () => {
  const env = (over: Partial<InstallEnv>): InstallEnv => ({ platform: "android", browser: "chrome", standalone: false, ...over });
  const base = { canPrompt: true, installed: false, snoozed: false, pathname: "/leads" };

  it("shows when a native prompt is available", () => {
    expect(shouldShowBanner({ ...base, env: env({}) })).toBe(true);
  });

  it("shows on iOS (links to instructions) even without a native prompt", () => {
    expect(shouldShowBanner({ ...base, canPrompt: false, env: env({ platform: "ios", browser: "safari" }) })).toBe(true);
  });

  it("stays hidden when there is nothing to offer or before detection", () => {
    expect(shouldShowBanner({ ...base, canPrompt: false, env: env({}) })).toBe(false);
    expect(shouldShowBanner({ ...base, env: null })).toBe(false);
  });

  it("hides completely when installed, running standalone, snoozed, or on the install page", () => {
    expect(shouldShowBanner({ ...base, env: env({ standalone: true }) })).toBe(false);
    expect(shouldShowBanner({ ...base, installed: true, env: env({}) })).toBe(false);
    expect(shouldShowBanner({ ...base, snoozed: true, env: env({}) })).toBe(false);
    expect(shouldShowBanner({ ...base, pathname: "/settings/install", env: env({}) })).toBe(false);
  });
});
