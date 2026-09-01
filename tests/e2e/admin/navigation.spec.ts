import { test, expect } from "../fixtures/network-guard";
import { assertNoBrowserErrors } from "../helpers/browser-errors";
import { clickAndWaitForUrl } from "../helpers/navigation";

const PRIMARY_NAV = [
  { label: "Today", href: "/dashboard" },
  { label: "Leads", href: "/leads" },
  { label: "Properties", href: "/properties" },
  { label: "Visits", href: "/visits" },
  { label: "Follow-ups", href: "/follow-ups" },
];

test.describe("Admin navigation", () => {
  test("primary nav renders and every link navigates without error", async ({ page, errors }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    for (const item of PRIMARY_NAV) {
      const hrefPattern = new RegExp(item.href.replace("/", "\\/"));
      await clickAndWaitForUrl(page, item.label, hrefPattern);
      await expect(page).toHaveURL(hrefPattern);
    }

    assertNoBrowserErrors(errors);
  });

  test("secondary nav sections (More / Administration) are visible", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("More", { exact: true })).toBeVisible();
    await expect(page.getByText("Administration", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Team", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  });
});
