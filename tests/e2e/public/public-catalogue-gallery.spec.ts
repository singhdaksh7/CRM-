import { test, expect, type Page } from "@playwright/test";
import { detectHorizontalOverflow } from "../helpers/overflow";
import { getQaCatalogueToken, QA_LEAD_NAMES, QA_PROPERTY_TITLES } from "../fixtures/qa-data";

/**
 * Mobile QA for the public catalogue's multi-image gallery (Previous/Next,
 * swipe, dot/counter indicators, broken-image fallback) - the gap flagged
 * as UNVERIFIED in the prior report. The seeded "QA Public Catalogue"
 * (tests/e2e/setup/seed-qa-workflow.ts) has two properties: D carries a
 * 4-image gallery (3 real self-contained data: URIs + 1 deliberately
 * malformed one, so this never depends on network/storage reachability),
 * A has none (exercises the no-image placeholder alongside D's real
 * gallery in the same catalogue).
 */
const WIDTHS = [375, 390, 430];

const SENSITIVE_STRINGS = [
  "QA-BUILDING-D",
  "QA-FLAT-D-303",
  "QA-GATE-D-2",
  "QA-ENTRY-INSTRUCTIONS-D",
  "QA-INTERNAL-NOTES-D",
  "QA-NEGOTIATION-NOTES-D",
  "QA-HIDDEN-REMARKS-D",
  "+911000099001", // ownerPhone
  "storageKey",
  "r2.cloudflarestorage.com",
];

/** Playwright's dispatchEvent can't construct a real TouchList, so a swipe is fired from inside the page via a real TouchEvent. */
async function swipe(page: Page, selector: string, deltaX: number) {
  await page.locator(selector).first().evaluate((el, dx) => {
    const rect = el.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const touch = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [touch(startX)], changedTouches: [touch(startX)] }));
    el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], changedTouches: [touch(startX + dx)] }));
  }, deltaX);
}

for (const width of WIDTHS) {
  test.describe(`Public catalogue gallery @ ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true });

    test("opens without login, no horizontal overflow, both properties render", async ({ page }) => {
      const token = await getQaCatalogueToken(QA_LEAD_NAMES.publicCatalogue);
      const res = await page.goto(`/share/catalogue/${token}`);
      expect(res?.status()).toBeLessThan(400);

      const overflow = await detectHorizontalOverflow(page);
      expect(overflow, `overflow @ ${width}px: ${overflow}`).toBeNull();

      await expect(page.getByText("QA Public Catalogue")).toBeVisible();
      await expect(page.getByText(QA_PROPERTY_TITLES.D)).toBeVisible();
      await expect(page.getByText(QA_PROPERTY_TITLES.A)).toBeVisible();

      // Locality, title, price all readable for the gallery property.
      await expect(page.getByText("Pitampura", { exact: false }).first()).toBeVisible();
      await expect(page.getByText(/₹18,000/).first()).toBeVisible();
    });

    test("cover photo shown first, counter/dots present, Previous/Next reach every image, both are tappable", async ({ page }) => {
      const token = await getQaCatalogueToken(QA_LEAD_NAMES.publicCatalogue);
      await page.goto(`/share/catalogue/${token}`);

      const galleryImg = page.getByAltText(/photo 1 of 4/);
      await expect(galleryImg).toBeVisible();
      await expect(page.getByText("1 / 4")).toBeVisible();

      const nextBtn = page.getByRole("button", { name: "Next photo" }).first();
      const prevBtn = page.getByRole("button", { name: "Previous photo" }).first();
      for (const btn of [nextBtn, prevBtn]) {
        const box = await btn.boundingBox();
        expect(box, "gallery nav button must have a real, tappable bounding box").not.toBeNull();
        if (box) {
          expect(box.width).toBeGreaterThan(0);
          expect(box.height).toBeGreaterThan(0);
        }
      }

      // Reach image 2, then image 3, via Next.
      await nextBtn.click();
      await expect(page.getByText("2 / 4")).toBeVisible();
      await expect(page.getByAltText(/photo 2 of 4/)).toBeVisible();
      await nextBtn.click();
      await expect(page.getByText("3 / 4")).toBeVisible();

      // Image 4 is the deliberately broken one - the fallback text shows,
      // but the gallery controls (Previous/Next/dots) must remain usable,
      // not vanish and trap the viewer.
      await nextBtn.click();
      await expect(page.getByText("4 / 4")).toBeVisible();
      await expect(page.getByText("Photo unavailable")).toBeVisible();
      await expect(nextBtn).toBeVisible();
      await expect(prevBtn).toBeVisible();
      const overflowAfterBroken = await detectHorizontalOverflow(page);
      expect(overflowAfterBroken, `overflow after broken image @ ${width}px: ${overflowAfterBroken}`).toBeNull();

      // Previous from the broken image returns to a working one.
      await prevBtn.click();
      await expect(page.getByText("3 / 4")).toBeVisible();
      await expect(page.getByAltText(/photo 3 of 4/)).toBeVisible();

      // Dot indicators: 4 of them, clicking the first jumps back to image 1.
      const dots = page.getByRole("button", { name: /Go to photo \d/ });
      await expect(dots).toHaveCount(4);
      await dots.nth(0).click();
      await expect(page.getByText("1 / 4")).toBeVisible();
    });

    test("swipe left advances to the next photo, swipe right returns", async ({ page }) => {
      const token = await getQaCatalogueToken(QA_LEAD_NAMES.publicCatalogue);
      await page.goto(`/share/catalogue/${token}`);
      await expect(page.getByText("1 / 4")).toBeVisible();

      await swipe(page, ".touch-pan-y", -80); // swipe left -> next
      await expect(page.getByText("2 / 4")).toBeVisible();

      await swipe(page, ".touch-pan-y", 80); // swipe right -> previous
      await expect(page.getByText("1 / 4")).toBeVisible();
    });

    test("second property with no images shows the professional no-photo placeholder, not a broken image or fake photo", async ({ page }) => {
      const token = await getQaCatalogueToken(QA_LEAD_NAMES.publicCatalogue);
      await page.goto(`/share/catalogue/${token}`);
      await expect(page.getByText("No photo available")).toBeVisible();
    });

    test("full privacy audit: rendered DOM never exposes exact address/GPS/internal notes/owner info/storage keys", async ({ page }) => {
      const token = await getQaCatalogueToken(QA_LEAD_NAMES.publicCatalogue);
      await page.goto(`/share/catalogue/${token}`);
      await expect(page.getByText("QA Public Catalogue")).toBeVisible();

      const bodyText = await page.locator("body").innerText();
      const html = await page.content();
      for (const needle of SENSITIVE_STRINGS) {
        expect(bodyText, `"${needle}" must not appear in rendered text @ ${width}px`).not.toContain(needle);
        expect(html, `"${needle}" must not appear in rendered HTML @ ${width}px`).not.toContain(needle);
      }
    });
  });
}
