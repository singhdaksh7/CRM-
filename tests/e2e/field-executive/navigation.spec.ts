import { test, expect } from "../fixtures/network-guard";
import { assertNoBrowserErrors } from "../helpers/browser-errors";
import { clickAndWaitForUrl } from "../helpers/navigation";

const PRIMARY_NAV = [
  { label: "Today", href: "/executive-dashboard" },
  { label: "My Leads", href: "/leads" },
  { label: "My Visits", href: "/visits" },
  { label: "Visit Properties", href: "/properties" },
];

test.describe("Field Executive navigation", () => {
  test("simplified nav renders and every link navigates without error", async ({ page, errors }) => {
    await page.goto("/executive-dashboard");
    await expect(page).toHaveURL(/\/executive-dashboard/);

    for (const item of PRIMARY_NAV) {
      await clickAndWaitForUrl(page, item.label, new RegExp(item.href.replace("/", "\\/")));
    }

    assertNoBrowserErrors(errors);
  });

  test("FE does not receive the full Admin navigation", async ({ page }) => {
    await page.goto("/executive-dashboard");
    for (const label of ["Deals", "Team", "Reports", "Settings", "Integrations", "Administration"]) {
      await expect(page.getByRole("link", { name: label, exact: true })).not.toBeVisible();
      await expect(page.getByText(label, { exact: true })).not.toBeVisible();
    }
  });
});
