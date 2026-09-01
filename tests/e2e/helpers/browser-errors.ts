import type { Page, Response } from "@playwright/test";

export interface BrowserErrorCollector {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  http500s: string[];
  unexpected404s: string[];
}

/**
 * Console noise we've verified is harmless framework diagnostics, not real
 * defects. Add to this list only after investigating - never to silence a
 * real error.
 */
const IGNORED_CONSOLE_PATTERNS = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
];

export function attachBrowserErrorCollector(page: Page): BrowserErrorCollector {
  const collector: BrowserErrorCollector = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    http500s: [],
    unexpected404s: [],
  };

  page.on("pageerror", (err) => {
    collector.pageErrors.push(err.message);
  });

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE_PATTERNS.some((p) => p.test(text))) return;
    collector.consoleErrors.push(text);
  });

  page.on("requestfailed", (request) => {
    collector.failedRequests.push(`${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
  });

  page.on("response", (response: Response) => {
    const status = response.status();
    const url = response.url();
    if (status === 500) collector.http500s.push(url);
    if (status === 404 && !url.includes("/favicon.ico")) collector.unexpected404s.push(url);
  });

  return collector;
}

export function assertNoBrowserErrors(collector: BrowserErrorCollector) {
  const problems: string[] = [];
  if (collector.pageErrors.length) problems.push(`pageerror: ${collector.pageErrors.join(" | ")}`);
  if (collector.consoleErrors.length) problems.push(`console.error: ${collector.consoleErrors.join(" | ")}`);
  if (collector.http500s.length) problems.push(`HTTP 500: ${collector.http500s.join(" | ")}`);
  if (problems.length) {
    throw new Error(`Browser errors detected:\n${problems.join("\n")}`);
  }
}
