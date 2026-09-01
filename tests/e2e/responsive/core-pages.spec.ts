import { test, expect } from "@playwright/test";
import { detectHorizontalOverflow } from "../helpers/overflow";

const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

const PAGES = ["/dashboard", "/leads", "/properties", "/visits"];

for (const viewport of WIDTHS) {
  test.describe(`Responsive @ ${viewport.width}px`, () => {
    test.use({ viewport, storageState: "tests/e2e/.auth/admin.json" });

    for (const path of PAGES) {
      test(`${path} has no whole-page horizontal overflow`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const overflow = await detectHorizontalOverflow(page);
        expect(overflow, `Horizontal overflow on ${path} @ ${viewport.width}px: ${overflow}`).toBeNull();
      });
    }

    if (viewport.width === 390) {
      test("mobile navigation opens and items are tappable", async ({ page }) => {
        await page.goto("/dashboard");
        const menuButton = page.getByRole("button", { name: /menu/i }).first();
        if (await menuButton.count()) {
          await menuButton.click();
          await expect(page.getByRole("link", { name: "Leads", exact: true })).toBeVisible();
        }
      });
    }
  });
}
