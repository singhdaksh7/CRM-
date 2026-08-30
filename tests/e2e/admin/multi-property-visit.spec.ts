import { test, expect } from "../fixtures/network-guard";
import { getQaVisitId, QA_LEAD_NAMES, QA_PROPERTY_TITLES } from "../fixtures/qa-data";

test.describe("Multi-property visit", () => {
  test("all three properties (A, C, D) render on the visit detail page", async ({ page }) => {
    const visitId = await getQaVisitId(QA_LEAD_NAMES.multiVisit);
    await page.goto(`/visits/${visitId}`);

    // This asserts the VisitProperty-based multi-property rendering path
    // (v.properties), not just the legacy single Visit.propertyId - a visit
    // built from only propertyId would show exactly one of these, not all three.
    await expect(page.getByText(QA_PROPERTY_TITLES.A)).toBeVisible();
    await expect(page.getByText(QA_PROPERTY_TITLES.C)).toBeVisible();
    await expect(page.getByText(QA_PROPERTY_TITLES.D)).toBeVisible();
  });
});
