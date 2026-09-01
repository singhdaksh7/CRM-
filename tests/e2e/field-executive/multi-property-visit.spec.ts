import { test, expect } from "../fixtures/network-guard";
import { getQaVisitId, QA_LEAD_NAMES, QA_PROPERTY_TITLES } from "../fixtures/qa-data";

test.describe("Multi-property visit - assigned FE", () => {
  test("assigned FE can access all three visit properties (A, C, D)", async ({ page }) => {
    const visitId = await getQaVisitId(QA_LEAD_NAMES.multiVisit);
    await page.goto(`/visits/${visitId}`);

    await expect(page.getByText(QA_PROPERTY_TITLES.A)).toBeVisible();
    await expect(page.getByText(QA_PROPERTY_TITLES.C)).toBeVisible();
    await expect(page.getByText(QA_PROPERTY_TITLES.D)).toBeVisible();
  });
});
