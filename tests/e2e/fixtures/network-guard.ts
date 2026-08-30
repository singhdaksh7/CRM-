import { test as base, type Page } from "@playwright/test";
import { attachBrowserErrorCollector, type BrowserErrorCollector } from "../helpers/browser-errors";

/**
 * Endpoints that would represent a real outbound customer communication if
 * ever called during a workflow that isn't an explicit human-triggered send
 * (e.g. Settings > Send Test Message, or clicking "Share Properties").
 * Zero-auto-send tests assert these are NOT called as a side effect of
 * navigation, lead/property creation, matching, preference recording, etc.
 */
const CUSTOMER_SEND_ENDPOINTS = [
  /\/api\/leads\/[^/]+\/whatsapp(?!\/simulate)/, // real send, not the QA simulate-* diagnostics
  /\/api\/system\/whatsapp-test-send/,
  /\/api\/catalogues\/whatsapp-fallback/,
];

export interface NetworkGuard {
  unexpectedSendCalls: string[];
}

export const test = base.extend<{
  errors: BrowserErrorCollector;
  networkGuard: NetworkGuard;
}>({
  errors: async ({ page }, runTest) => {
    const collector = attachBrowserErrorCollector(page);
    await runTest(collector);
  },
  networkGuard: async ({ page }, runTest) => {
    const guard: NetworkGuard = { unexpectedSendCalls: [] };
    page.on("request", (request) => {
      const url = request.url();
      if (request.method() === "GET") return;
      if (CUSTOMER_SEND_ENDPOINTS.some((re) => re.test(url))) {
        guard.unexpectedSendCalls.push(`${request.method()} ${url}`);
      }
    });
    await runTest(guard);
  },
});

export { expect } from "@playwright/test";
export type { Page };
