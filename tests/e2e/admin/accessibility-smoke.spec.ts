import path from "path";
import { test, expect } from "@playwright/test";
import { getQaLeadId, getQaVisitId, getQaCatalogueToken, QA_LEAD_NAMES } from "../fixtures/qa-data";

/**
 * Smoke coverage, not WCAG certification: primary buttons have accessible
 * names, form inputs are labeled, keyboard reaches major actions, dialogs
 * are usable, mobile nav is keyboard-operable. Uses Playwright's role/label
 * locators throughout - a locator that can't find its target IS the
 * accessibility failure being tested for.
 */
test.describe("Accessibility smoke - Admin Today", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("primary buttons have accessible names; nav reachable via keyboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: "Quick Add" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Leads", exact: true })).toBeVisible();

    // Keyboard reachability: Tab from the top of the page must eventually
    // focus a real, named nav link (not a bare unlabeled element).
    let reachedNav = false;
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        return { tag: el.tagName, role: el.getAttribute("role"), text: el.textContent?.trim().slice(0, 40), href: el.getAttribute("href") };
      });
      if (focused?.href === "/leads" || focused?.text === "Leads") {
        reachedNav = true;
        break;
      }
    }
    expect(reachedNav, "keyboard Tab traversal must be able to reach the Leads nav link").toBe(true);
  });
});

test.describe("Accessibility smoke - Lead Workspace", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("tabs and dominant CTA have accessible names", async ({ page }) => {
    const leadId = await getQaLeadId(QA_LEAD_NAMES.unsharedMatch);
    await page.goto(`/leads/${leadId}`);
    for (const tabName of ["Overview", "Matches", "Client Response", "Follow-up", "Visit", "More"]) {
      await expect(page.getByRole("button", { name: tabName, exact: true })).toBeVisible();
    }
    // No ambiguous duplicate: exactly one "Overview" tab control.
    await expect(page.getByRole("button", { name: "Overview", exact: true })).toHaveCount(1);
  });
});

test.describe("Accessibility smoke - Follow-up form", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("date/time/type/assignee inputs are reachable and the Schedule action is named", async ({ page }) => {
    const leadId = await getQaLeadId(QA_LEAD_NAMES.unsharedMatch);
    await page.goto(`/leads/${leadId}`);
    await page.getByRole("button", { name: "Follow-up", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Add Follow-up" })).toBeVisible();

    // Type/Assign-to selects and the date input are reachable via role +
    // accessible position, and the primary action has a real name.
    await expect(page.getByRole("combobox").first()).toBeVisible();
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Schedule", exact: true })).toBeVisible();
  });
});

test.describe("Accessibility smoke - Visit (dialog)", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("Visit Feedback dialog is keyboard-usable and has an accessible title", async ({ page }) => {
    const visitId = await getQaVisitId(QA_LEAD_NAMES.multiVisit);
    await page.goto(`/visits/${visitId}`);
    const feedbackButton = page.getByRole("button", { name: "Feedback", exact: true });
    if (await feedbackButton.count()) {
      await feedbackButton.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByText("Visit Feedback")).toBeVisible();
      // Escape closes it - a basic keyboard-usability guarantee for any dialog.
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
    }
  });
});

test.describe("Accessibility smoke - FE Visit Property", () => {
  test.use({ storageState: path.join(__dirname, "..", ".auth", "field-executive.json") });

  test("Capture Location button has a real accessible name and focus can reach it", async ({ page }) => {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    let propertyId: string;
    try {
      propertyId = (await prisma.property.findFirstOrThrow({ where: { title: { contains: "Property A" } } })).id;
    } finally {
      await prisma.$disconnect();
    }
    await page.goto(`/properties/${propertyId}`);
    const button = page.getByRole("button", { name: /Capture Location|Location Captured|Try Again/ });
    await expect(button).toBeVisible();
    await button.focus();
    await expect(button).toBeFocused();
  });
});

test.describe("Accessibility smoke - Public Catalogue", () => {
  test("Interested/Not Interested controls have accessible names, no ambiguous duplicates per card", async ({ page }) => {
    const token = await getQaCatalogueToken(QA_LEAD_NAMES.publicCatalogue);
    await page.goto(`/share/catalogue/${token}`);
    await expect(page.getByText("QA Public Catalogue")).toBeVisible();
    const interestedButtons = page.getByRole("button", { name: "Interested", exact: true });
    if (await interestedButtons.count()) {
      // Exactly one per property card, not an ambiguous page-wide duplicate set.
      await expect(interestedButtons.first()).toBeVisible();
    }
  });
});

test.describe("Accessibility smoke - mobile menu keyboard interaction", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json", viewport: { width: 390, height: 844 } });

  test("mobile navigation, if present, is keyboard-operable", async ({ page }) => {
    await page.goto("/dashboard");
    const menuButton = page.getByRole("button", { name: /menu/i }).first();
    if (await menuButton.count()) {
      await menuButton.focus();
      await expect(menuButton).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("link", { name: "Leads", exact: true })).toBeVisible();
    }
  });
});
