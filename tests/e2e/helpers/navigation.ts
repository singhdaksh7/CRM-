import type { Page } from "@playwright/test";

/**
 * Click a link and wait for the resulting URL - safe for this app's client-
 * side (App Router) navigation. `page.waitForURL`'s default `waitUntil:
 * "load"` never fires for a router.push()/<Link> transition (no full page
 * reload), so it hangs for the full timeout even after the URL already
 * matches. "commit" resolves as soon as the SPA navigation is committed.
 */
export async function clickAndWaitForUrl(page: Page, linkName: string, hrefPattern: RegExp, timeout = 10_000) {
  await page.getByRole("link", { name: linkName, exact: true }).first().click();
  await page.waitForURL(hrefPattern, { timeout, waitUntil: "commit" });
}
