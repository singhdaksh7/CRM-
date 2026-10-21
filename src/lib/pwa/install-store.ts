import { detectBrowser, detectPlatform, isStandalone, type InstallEnv } from "./install";

/**
 * Client-side external store for install state. `beforeinstallprompt` fires
 * once, early, on any page - so listeners are attached from the root layout
 * (via initInstallStore) and the deferred event is kept here for whichever
 * component (install page, banner) wants it later.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallState {
  /** null until the client has inspected the browser (and during SSR). */
  env: InstallEnv | null;
  canPrompt: boolean;
  /** Set after the user accepts the prompt or the browser fires appinstalled. */
  installed: boolean;
  /** Result of the last native prompt, for UI feedback. */
  lastOutcome: "accepted" | "dismissed" | null;
}

const SERVER_STATE: InstallState = { env: null, canPrompt: false, installed: false, lastOutcome: null };

let state: InstallState = SERVER_STATE;
let deferred: BeforeInstallPromptEvent | null = null;
let initialised = false;
const listeners = new Set<() => void>();

function set(next: Partial<InstallState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function subscribeInstallStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getInstallState = () => state;
export const getServerInstallState = () => SERVER_STATE;

function readEnv(): InstallEnv {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const matches = ["standalone", "minimal-ui", "window-controls-overlay"].some(
    (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches
  );
  return {
    platform: detectPlatform({ userAgent: nav.userAgent, platform: nav.platform, maxTouchPoints: nav.maxTouchPoints }),
    browser: detectBrowser(nav.userAgent),
    standalone: isStandalone({ matchesStandalone: matches, navigatorStandalone: nav.standalone }),
  };
}

export function initInstallStore() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;

  set({ env: readEnv() });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    set({ canPrompt: false, installed: true });
  });
  // Keep standalone in sync if the display mode changes while the page is open.
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", () => set({ env: readEnv() }));
}

/** Launches the native install prompt. Returns the user's choice, or null if none was available. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | null> {
  const event = deferred;
  if (!event) return null;
  // The event can only be used once, whatever the user chooses.
  deferred = null;
  set({ canPrompt: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  set({ lastOutcome: outcome, installed: outcome === "accepted" ? true : state.installed });
  return outcome;
}
