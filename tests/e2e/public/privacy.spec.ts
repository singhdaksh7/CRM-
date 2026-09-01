import { test, expect } from "@playwright/test";

/**
 * Smoke-level public safety checks that don't depend on QA-seeded property
 * data (none is seeded in this pass - see docs/browser-qa.md "Known gaps").
 * Confirms an anonymous context gets a clean not-found/denied response
 * rather than a crash or a leaking error page, and that no authenticated
 * session state leaks into a brand-new anonymous context.
 */
test.describe("Public routes - anonymous context safety smoke", () => {
  test("unauthenticated request to a nonexistent public property does not 500 or leak internals", async ({ page }) => {
    const response = await page.goto("/p/qa-nonexistent-property-id");
    expect(response?.status()).not.toBe(500);
    const bodyText = await page.textContent("body");
    for (const leak of ["internalNotes", "negotiationNotes", "ownerPhone", "ownerEmail", "gateNumber"]) {
      expect(bodyText ?? "").not.toContain(leak);
    }
  });

  test("anonymous browser context has no authenticated session", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/dashboard");
    // Must be redirected to /login (or denied), never render the
    // authenticated dashboard for a context with no stored session.
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).toMatch(/\/login/);
    await context.close();
  });
});
