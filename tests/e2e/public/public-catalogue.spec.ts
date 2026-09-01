import { test, expect } from "../fixtures/network-guard";
import { getQaCatalogueToken, QA_LEAD_NAMES } from "../fixtures/qa-data";

const SENSITIVE_STRINGS = [
  "QA-BUILDING-D",
  "QA-FLAT-D-303",
  "QA-GATE-D-2",
  "QA-ENTRY-INSTRUCTIONS-D",
  "QA-INTERNAL-NOTES-D",
  "QA-NEGOTIATION-NOTES-D",
  "QA-HIDDEN-REMARKS-D",
  "+911000099001", // ownerPhone
];

test.describe("Public catalogue (/share/catalogue/[token])", () => {
  test("opens anonymously, renders the catalogue, and calls the new /api/catalogues/public/[token] routes", async ({ page }) => {
    const token = await getQaCatalogueToken(QA_LEAD_NAMES.publicCatalogue);

    const apiCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/catalogues/")) apiCalls.push(req.url());
    });

    const res = await page.goto(`/share/catalogue/${token}`);
    expect(res?.status()).toBeLessThan(400);

    await expect(page.getByText("QA Public Catalogue")).toBeVisible();
    // The catalogue view fires a view-tracking POST on mount - proves the
    // moved public API prefix is actually what the browser calls, not just
    // what the server component reads directly.
    await expect.poll(() => apiCalls.some((u) => u.includes(`/api/catalogues/public/${token}/`))).toBe(true);
    expect(apiCalls.some((u) => u.includes(`/api/catalogues/${token}/`) && !u.includes("/public/"))).toBe(false);
  });

  test("full privacy audit: DOM and network responses never contain internal/owner/exact-location fields", async ({ page }) => {
    const token = await getQaCatalogueToken(QA_LEAD_NAMES.publicCatalogue);

    const responseBodies: string[] = [];
    page.on("response", async (res) => {
      const type = res.request().resourceType();
      if (type !== "document" && type !== "xhr" && type !== "fetch") return;
      try {
        responseBodies.push(await res.text());
      } catch {
        // non-text response - irrelevant here
      }
    });

    await page.goto(`/share/catalogue/${token}`);
    await expect(page.getByText("QA Public Catalogue")).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    const html = await page.content();

    for (const needle of SENSITIVE_STRINGS) {
      expect(bodyText).not.toContain(needle);
      expect(html).not.toContain(needle);
      for (const body of responseBodies) {
        expect(body).not.toContain(needle);
      }
    }
  });
});
