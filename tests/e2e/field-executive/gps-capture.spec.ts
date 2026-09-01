import { test, expect } from "../fixtures/network-guard";
import { getQaPropertyId, QA_PROPERTY_TITLES } from "../fixtures/qa-data";

const FAKE_COORDS = { latitude: 28.6304, longitude: 77.0821 }; // deterministic synthetic Rohini-area coordinates

/**
 * Deterministic setup only - resets Property A's capture-audit fields to
 * their pre-capture state before every test in this file, so "starts idle"
 * holds regardless of what an earlier run (against this same persistent
 * local DB) left behind. This is never a shortcut around the capture
 * workflow itself - every test still exercises the real click ->
 * getCurrentPosition -> POST /api/properties/[id]/capture-location path;
 * this only ensures the button's *starting* state is the one being tested.
 */
test.beforeEach(async () => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const propertyId = await prisma.property
      .findFirstOrThrow({ where: { title: QA_PROPERTY_TITLES.A } })
      .then((p) => p.id);
    await prisma.property.update({
      where: { id: propertyId },
      data: { latitude: null, longitude: null, locationAccuracy: null, locationCapturedAt: null, locationCapturedById: null },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test.describe("GPS explicit capture - assigned FE", () => {
  test.use({ permissions: ["geolocation"], geolocation: FAKE_COORDS });

  test("no geolocation request on page load, explicit click captures deterministic coordinates", async ({ page }) => {
    const propertyId = await getQaPropertyId(QA_PROPERTY_TITLES.A);
    await page.goto(`/properties/${propertyId}`);
    await expect(page.getByText(QA_PROPERTY_TITLES.A)).toBeVisible();

    // Step 1: no capture happened just from loading the page - the button is
    // still in its idle "Capture Location" state (capture-location-button.tsx
    // never calls getCurrentPosition until the click handler runs; if it had
    // fired on mount, the button would already show "Location Captured" or
    // "Try Again" here instead).
    const button = page.getByRole("button", { name: "Capture Location" });
    await expect(button).toBeVisible();

    // Step 2: explicit click.
    await button.click();

    // Step 3: transient "Capturing..." state (best-effort - may resolve
    // before this assertion if the request is very fast; the final-state
    // assertion below is what actually matters).
    await page.getByRole("button", { name: /Capturing\.\.\.|Location Captured/ }).waitFor({ state: "visible", timeout: 5000 });

    // Step 4: success. Scoped to the inline status paragraph - the success
    // toast renders the same text a second time elsewhere on the page.
    await expect(page.getByRole("button", { name: "Location Captured" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("status").getByText(/Location captured/)).toBeVisible();
  });

  test("persisted latitude/longitude/accuracy/capturedAt/capturedById after capture, and publicLocationMode is unchanged", async ({ page, networkGuard }) => {
    const propertyId = await getQaPropertyId(QA_PROPERTY_TITLES.A);
    await page.goto(`/properties/${propertyId}`);
    const button = page.getByRole("button", { name: /Capture Location|Location Captured|Try Again/ });
    await expect(button).toBeVisible();
    if ((await button.textContent())?.includes("Location Captured")) {
      // Already captured by the previous test in this file - re-capture is
      // idempotent and still exercises the same persistence path.
      await page.reload();
    }
    await page.getByRole("button", { name: /Capture Location|Try Again/ }).click();
    await expect(page.getByRole("button", { name: "Location Captured" })).toBeVisible({ timeout: 15_000 });

    // Read back via the admin-visible internal API is out of scope for the
    // FE-scoped session here - verify persistence directly against the
    // database instead, exactly what a real acceptance check needs.
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      const property = await prisma.property.findUniqueOrThrow({
        where: { id: propertyId },
        select: {
          latitude: true,
          longitude: true,
          locationAccuracy: true,
          locationCapturedAt: true,
          locationCapturedById: true,
          publicLocationMode: true,
        },
      });
      expect(property.latitude).toBeCloseTo(FAKE_COORDS.latitude, 2);
      expect(property.longitude).toBeCloseTo(FAKE_COORDS.longitude, 2);
      expect(property.locationAccuracy).not.toBeNull();
      expect(property.locationCapturedAt).not.toBeNull();
      expect(property.locationCapturedById).not.toBeNull();
      // Capturing an exact GPS fix must never widen what the PUBLIC catalogue
      // is allowed to reveal - that is a separate, explicit staff decision.
      expect(property.publicLocationMode).toBe("LOCALITY_ONLY");
    } finally {
      await prisma.$disconnect();
    }

    expect(networkGuard.unexpectedSendCalls, "no automatic customer communication during GPS capture").toEqual([]);
  });
});

test.describe("GPS permission denial - assigned FE", () => {
  test.use({ permissions: [] });

  test("denied browser permission produces a truthful retry state, no crash, no infinite spinner, no auto-retry", async ({ page }) => {
    const propertyId = await getQaPropertyId(QA_PROPERTY_TITLES.A);
    await page.goto(`/properties/${propertyId}`);

    const button = page.getByRole("button", { name: /Capture Location|Try Again/ });
    await expect(button).toBeVisible();
    await button.click();

    await expect(page.getByRole("button", { name: "Try Again" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("status").filter({ hasText: /permission was denied|Could not determine your location/i })).toBeVisible();

    // No infinite spinner: the button must not be stuck on "Capturing...".
    await expect(page.getByRole("button", { name: "Capturing..." })).not.toBeVisible();

    // No automatic retry: waiting idle must not silently flip back to success/capturing.
    await page.waitForTimeout(3000);
    await expect(page.getByRole("button", { name: "Try Again" })).toBeVisible();
  });
});
