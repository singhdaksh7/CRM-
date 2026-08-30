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

test.describe("Data Manager navigation", () => {
  test("primary nav renders and every link navigates without error", async ({ page, errors }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    for (const item of PRIMARY_NAV) {
      await clickAndWaitForUrl(page, item.label, new RegExp(item.href.replace("/", "\\/")));
    }

    assertNoBrowserErrors(errors);
  });

  test("Admin-only sections are not exposed in the UI", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Administration", { exact: true })).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Team", exact: true })).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Settings", exact: true })).not.toBeVisible();
  });

  test("direct navigation to an admin-only route is denied server-side, not just hidden in UI", async ({ page }) => {
    const response = await page.goto("/employees");
    // Either a redirect away from /employees, or a non-200 - never a
    // rendered Employees admin page for this role.
    const finalUrl = page.url();
    const status = response?.status();
    const wasRedirectedAway = !finalUrl.includes("/employees");
    const wasDenied = status !== undefined && status >= 400;
    expect(wasRedirectedAway || wasDenied).toBeTruthy();
  });
});
