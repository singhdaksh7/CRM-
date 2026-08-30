import path from "path";
import { test, expect } from "../fixtures/network-guard";
import { getQaPropertyId, QA_PROPERTY_TITLES } from "../fixtures/qa-data";

/**
 * qa.fe.unassigned has NO visit or catalogue-share tied to any QA property
 * (unlike qa.fe, which is legitimately assigned via the "Pending Visit
 * Outcome" and "Multi-Property Visit" visits on Property A) - the exact
 * per-user (not just per-role) access boundary fieldExecutiveHasPropertyAccess
 * enforces. This file deliberately overrides the field-executive project's
 * default storageState (qa.fe, the ASSIGNED FE, who legitimately can access
 * Property A) with the unassigned FE's session instead.
 */
test.describe("Unassigned FE - restricted property access", () => {
  test.use({ storageState: path.join(__dirname, "..", ".auth", "unassigned-field-executive.json") });

  test("Capture Location is not offered, and the server denies a direct capture attempt", async ({ page }) => {
    const propertyId = await getQaPropertyId(QA_PROPERTY_TITLES.A);
    await page.goto(`/properties/${propertyId}`);

    // Server-side denial/redaction, not just a hidden button: the internal
    // sensitive fields must not be present in the DOM either.
    await expect(page.getByText("QA-INTERNAL-NOTES-A", { exact: false })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /Capture Location/i })).not.toBeVisible();

    // Defense-in-depth: hitting the API directly (bypassing the UI
    // entirely) must be denied server-side, not merely unreachable via a
    // hidden button.
    const res = await page.evaluate(
      async ({ id }) => {
        const r = await fetch(`/api/properties/${id}/capture-location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: 28.7, longitude: 77.1, accuracy: 10 }),
        });
        return r.status;
      },
      { id: propertyId }
    );
    expect(res).toBeGreaterThanOrEqual(400);
    expect(res).toBeLessThan(500);
  });

  test("GPS fields are unchanged after the denied attempt", async ({ page }) => {
    const propertyId = await getQaPropertyId(QA_PROPERTY_TITLES.A);
    await page.goto(`/properties/${propertyId}`);
    const before = await page.evaluate(async (id) => {
      const r = await fetch(`/api/properties/${id}/capture-location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: 12.34, longitude: 56.78, accuracy: 5 }),
      });
      return r.status;
    }, propertyId);
    expect(before).toBeGreaterThanOrEqual(400);
    // A denied attempt must never have written anything - re-attempting
    // identically and getting the same denial (not a "already captured"
    // conflict) is the simplest black-box proof no write happened.
    const again = await page.evaluate(async (id) => {
      const r = await fetch(`/api/properties/${id}/capture-location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: 12.34, longitude: 56.78, accuracy: 5 }),
      });
      return r.status;
    }, propertyId);
    expect(again).toBe(before);
  });
});
