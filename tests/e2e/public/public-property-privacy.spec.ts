import { test, expect } from "../fixtures/network-guard";
import { getQaPropertyId, QA_PROPERTY_TITLES } from "../fixtures/qa-data";

const SENSITIVE_STRINGS = [
  "QA-BUILDING-D",
  "QA-FLAT-D-303",
  "QA-GATE-D-2",
  "QA-ENTRY-INSTRUCTIONS-D",
  "QA-INTERNAL-NOTES-D",
  "QA-NEGOTIATION-NOTES-D",
  "QA-HIDDEN-REMARKS-D",
  "+911000099001", // ownerPhone
  "QA Synthetic Owner", // ownerName
];

test.describe("Public property page (/p/[id]) - full privacy audit", () => {
  test("anonymous DOM and network responses never contain internal/owner/exact-location fields", async ({ page }) => {
    const propertyId = await getQaPropertyId(QA_PROPERTY_TITLES.D);

    const responseBodies: string[] = [];
    page.on("response", async (res) => {
      if (res.request().resourceType() !== "document" && res.request().resourceType() !== "xhr" && res.request().resourceType() !== "fetch") return;
      try {
        responseBodies.push(await res.text());
      } catch {
        // non-text response (image/font/etc) - irrelevant to a text-field leak audit
      }
    });

    const res = await page.goto(`/p/${propertyId}`);
    expect(res?.status()).toBeLessThan(400);

    const bodyText = await page.locator("body").innerText();
    const html = await page.content();

    for (const needle of SENSITIVE_STRINGS) {
      expect(bodyText).not.toContain(needle);
      expect(html).not.toContain(needle);
      for (const body of responseBodies) {
        expect(body).not.toContain(needle);
      }
    }

    // Sanity check the audit itself isn't vacuous - the public-safe title must render.
    await expect(page.getByText(QA_PROPERTY_TITLES.D)).toBeVisible();
  });
});
