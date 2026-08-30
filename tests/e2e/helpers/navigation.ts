import type { Page } from "@playwright/test";

/**
 * Click a link and wait for the resulting URL - safe for this app's client-
 * side (App Router) navigation. `page.waitForURL`'s default `waitUntil:
 * "load"` never fires for a router.push()/<Link> transition (no full page
 * reload), so it hangs for the full timeout even after the URL already
 * matches. "commit" resolves as soon as the SPA navigation is committed.
 */
// 20s (not e.g. 10s): under a full-suite run, `next dev`'s on-demand route
// compilation can still be mid-render for a target page's first hit in this
// run - observed directly (the page's own "Rendering..." dev-tools
// indicator was still active at the moment of an earlier timeout here).
// Matches the reasoning behind auth.setup.ts's 30s login budget.
export async function clickAndWaitForUrl(page: Page, linkName: string, hrefPattern: RegExp, timeout = 20_000) {
  await page.getByRole("link", { name: linkName, exact: true }).first().click();
  await page.waitForURL(hrefPattern, { timeout, waitUntil: "commit" });
}
