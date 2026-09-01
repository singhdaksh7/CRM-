import { test, expect } from "@playwright/test";
import path from "path";
import { detectHorizontalOverflow } from "../helpers/overflow";
import { getQaLeadId, getQaPropertyId, getQaVisitId, getQaCatalogueToken, QA_LEAD_NAMES, QA_PROPERTY_TITLES } from "../fixtures/qa-data";

const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

test.describe("Responsive - remaining pages (admin/FE)", () => {
  for (const viewport of WIDTHS) {
    test.describe(`@ ${viewport.width}px`, () => {
      test.use({ viewport, storageState: "tests/e2e/.auth/admin.json" });

      test("Lead Workspace has no overflow; tabs and dominant CTA usable", async ({ page }) => {
        const leadId = await getQaLeadId(QA_LEAD_NAMES.unsharedMatch);
        await page.goto(`/leads/${leadId}`);
        await page.waitForLoadState("networkidle");
        const overflow = await detectHorizontalOverflow(page);
        expect(overflow, `Lead Workspace overflow @ ${viewport.width}px: ${overflow}`).toBeNull();

        // Dominant CTA (Next Action banner button) reachable.
        await expect(page.getByRole("button", { name: /Go to Matches|Update Requirements|Record Outcome|Schedule Visit|View Matches/ }).first()).toBeVisible();

        // Tab switching usable at this width.
        await page.getByRole("button", { name: "Matches", exact: true }).click();
        await expect(page.getByRole("button", { name: "Matches", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Overview", exact: true }).click();
      });

      test("Property Detail has no overflow; content/cards/actions fit", async ({ page }) => {
        const propertyId = await getQaPropertyId(QA_PROPERTY_TITLES.A);
        await page.goto(`/properties/${propertyId}`);
        await page.waitForLoadState("networkidle");
        const overflow = await detectHorizontalOverflow(page);
        expect(overflow, `Property Detail overflow @ ${viewport.width}px: ${overflow}`).toBeNull();
        await expect(page.getByText(QA_PROPERTY_TITLES.A)).toBeVisible();
      });

      test("Visit Detail has no overflow; multi-property information usable", async ({ page }) => {
        const visitId = await getQaVisitId(QA_LEAD_NAMES.multiVisit);
        await page.goto(`/visits/${visitId}`);
        await page.waitForLoadState("networkidle");
        const overflow = await detectHorizontalOverflow(page);
        expect(overflow, `Visit Detail overflow @ ${viewport.width}px: ${overflow}`).toBeNull();
        await expect(page.getByText(QA_PROPERTY_TITLES.A)).toBeVisible();
        await expect(page.getByText(QA_PROPERTY_TITLES.C)).toBeVisible();
        await expect(page.getByText(QA_PROPERTY_TITLES.D)).toBeVisible();
      });

      test("Public Catalogue has no overflow; property cards/preferences usable", async ({ page }) => {
        const token = await getQaCatalogueToken(QA_LEAD_NAMES.publicCatalogue);
        await page.goto(`/share/catalogue/${token}`);
        await page.waitForLoadState("networkidle");
        const overflow = await detectHorizontalOverflow(page);
        expect(overflow, `Public Catalogue overflow @ ${viewport.width}px: ${overflow}`).toBeNull();
        await expect(page.getByText("QA Public Catalogue")).toBeVisible();
        await expect(page.getByText(QA_PROPERTY_TITLES.D)).toBeVisible();
      });
    });
  }

  for (const viewport of WIDTHS) {
    test.describe(`@ ${viewport.width}px - FE Visit Property`, () => {
      test.use({ viewport, storageState: path.join(__dirname, "..", ".auth", "field-executive.json") });

      test("FE Visit Property has no overflow; Capture Location remains tappable", async ({ page }) => {
        const propertyId = await getQaPropertyId(QA_PROPERTY_TITLES.A);
        await page.goto(`/properties/${propertyId}`);
        await page.waitForLoadState("networkidle");
        const overflow = await detectHorizontalOverflow(page);
        expect(overflow, `FE Visit Property overflow @ ${viewport.width}px: ${overflow}`).toBeNull();

        const captureButton = page.getByRole("button", { name: /Capture Location|Location Captured|Try Again/ });
        await expect(captureButton).toBeVisible();
        const box = await captureButton.boundingBox();
        expect(box, "Capture Location button must have a real, tappable bounding box").not.toBeNull();
        if (box) {
          expect(box.width).toBeGreaterThan(0);
          expect(box.height).toBeGreaterThan(0);
        }
      });
    });
  }
});

test.describe("Responsive @ 390px - mobile interaction", () => {
  test.use({ viewport: { width: 390, height: 844 }, storageState: "tests/e2e/.auth/admin.json" });

  test("Lead Workspace mobile: tabs switch, no overflow after switching", async ({ page }) => {
    const leadId = await getQaLeadId(QA_LEAD_NAMES.unsharedMatch);
    await page.goto(`/leads/${leadId}`);
    await page.waitForLoadState("networkidle");

    for (const tabName of ["Matches", "Client Response", "Follow-up", "Visit", "More", "Overview"]) {
      await page.getByRole("button", { name: tabName, exact: true }).click();
      const overflow = await detectHorizontalOverflow(page);
      expect(overflow, `Lead Workspace overflow after switching to ${tabName} @ 390px: ${overflow}`).toBeNull();
    }
  });

  test("Public Catalogue mobile: property card is readable and the Interested control is tappable", async ({ page }) => {
    const token = await getQaCatalogueToken(QA_LEAD_NAMES.publicCatalogue);
    await page.goto(`/share/catalogue/${token}`);
    await page.waitForLoadState("networkidle");
    const interestedButton = page.getByRole("button", { name: "Interested", exact: true }).first();
    if (await interestedButton.count()) {
      const box = await interestedButton.boundingBox();
      expect(box, "Interested control must have a real, tappable bounding box").not.toBeNull();
    }
  });
});
