import { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/network-guard";
import { assertNoBrowserErrors } from "../helpers/browser-errors";
import { detectHorizontalOverflow } from "../helpers/overflow";

/**
 * "No visit on record" flow. Local QA database only (global safety guard). All rows carry RUN for cleanup.
 */
const prisma = new PrismaClient();
const RUN = `QAVR${Date.now().toString(36)}`;
const created = { leadIds: [] as string[], propertyIds: [] as string[] };
let feId = "";
let propertyId = "";
const PROPERTY_TITLE = `${RUN} Visited Flat`;

const statusSelect = (page: Page) => page.locator("select").filter({ has: page.locator('option[value="VISIT_COMPLETED"]') }).first();

async function makeLead(page: Page, label: string) {
  const r = await page.request.post("/api/leads", {
    data: { clientName: `${RUN} ${label}`, phone: `90000${Math.floor(10000 + Math.random() * 89999)}`, source: "MANUAL", requirementType: "RENT", assetClass: "RESIDENTIAL", preferredLocation: `${RUN} Area`, minBudget: 5000, maxBudget: 20000, preferredBhk: 1, priority: "WARM", assignedToId: feId },
  });
  expect(r.status()).toBeLessThan(300);
  const id = (await r.json()).lead.id as string;
  created.leadIds.push(id);
  return id;
}

// The backend rejects the premature Visit Completed with an intentional HTTP 409 (VISIT_REQUIRED); Chrome logs it as a console error.
function withoutExpected409(errors: Parameters<typeof assertNoBrowserErrors>[0]) {
  errors.consoleErrors = errors.consoleErrors.filter((e) => !/status of 409/.test(e));
  return errors;
}

function yesterday() {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

test.describe.serial("Visit Completed requires a visit", () => {
  test.beforeAll(async ({ browser }) => {
    feId = (await prisma.user.findFirstOrThrow({ where: { email: "qa.fe@example.test" } })).id;
    const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/admin.json" });
    const r = await ctx.request.post("/api/properties", {
      data: { title: PROPERTY_TITLE, propertyType: "APARTMENT", listingType: "RENT", assetClass: "RESIDENTIAL", status: "AVAILABLE", description: "QA synthetic fixture", city: "Delhi", area: `${RUN} Area`, address: `${RUN} Lane`, monthlyRent: 15000, securityDeposit: 30000, bhk: 1, bathrooms: 1, furnishing: "SEMI_FURNISHED", builtUpAreaSqft: 500, parkingAvailable: false, ownerName: "QA Owner", ownerPhone: "+911000099003", inventorySource: "DIRECT", amenities: [], images: [] },
    });
    expect(r.status()).toBeLessThan(300);
    propertyId = (await r.json()).property.id;
    created.propertyIds.push(propertyId);
    await ctx.close();
  });

  test.afterAll(async () => {
    const visits = await prisma.visit.findMany({ where: { leadId: { in: created.leadIds } }, select: { id: true } });
    await prisma.visitProperty.deleteMany({ where: { visitId: { in: visits.map((v) => v.id) } } });
    await prisma.visit.deleteMany({ where: { id: { in: visits.map((v) => v.id) } } });
    await prisma.lead.deleteMany({ where: { id: { in: created.leadIds } } });
    await prisma.property.deleteMany({ where: { id: { in: created.propertyIds } } });
    await prisma.$disconnect();
  });

  test("lead with an active visit: status change completes that visit, no dialog, appears under Visits > Completed", async ({ page, errors }) => {
    const leadId = await makeLead(page, "Has Visit");
    const visit = await prisma.visit.create({ data: { organizationId: "org_default", leadId, propertyId, assignedToId: feId, visitDate: new Date(), visitTime: "10:00", status: "SCHEDULED", properties: { create: [{ propertyId }] } } });

    await page.goto(`/leads/${leadId}`);
    await statusSelect(page).selectOption("VISIT_COMPLETED");
    await expect.poll(async () => (await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("VISIT_COMPLETED");
    await expect(page.getByText("No visit on record")).toHaveCount(0);

    const visits = await prisma.visit.findMany({ where: { leadId } });
    expect(visits).toHaveLength(1);
    expect(visits[0].id).toBe(visit.id);
    expect(visits[0].status).toBe("COMPLETED");
    expect(visits[0].completedAt).not.toBeNull();

    await page.goto("/visits?tab=completed");
    await expect(page.getByText(`${RUN} Has Visit`).first()).toBeVisible();
    assertNoBrowserErrors(errors);
  });

  test("lead with no visit: dialog opens, dropdown reverts, Cancel leaves the status unchanged", async ({ page, errors }) => {
    const leadId = await makeLead(page, "No Visit");
    await page.goto(`/leads/${leadId}`);

    await statusSelect(page).selectOption("VISIT_COMPLETED");
    await expect(page.getByText("No visit on record")).toBeVisible();
    await expect(page.getByText("This lead does not have an active visit to complete. Log the completed visit before marking the lead as Visit Completed.")).toBeVisible();
    await expect(statusSelect(page)).toHaveValue("NEW");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("NEW");
    expect(await prisma.visit.count({ where: { leadId } })).toBe(0);

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("No visit on record")).toHaveCount(0);
    await page.reload();
    await expect(statusSelect(page)).toHaveValue("NEW");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("NEW");
    assertNoBrowserErrors(withoutExpected409(errors));
  });

  test("submitting the dialog creates exactly one COMPLETED visit and moves the lead", async ({ page, networkGuard, errors }) => {
    const leadId = await makeLead(page, "Log Visit");
    const propBefore = JSON.stringify(await prisma.property.findUniqueOrThrow({ where: { id: propertyId } }));
    await page.goto(`/leads/${leadId}`);

    await statusSelect(page).selectOption("VISIT_COMPLETED");
    await expect(page.getByText("No visit on record")).toBeVisible();

    // Required fields: submit is blocked until a property is chosen.
    await page.getByRole("button", { name: /Log visit/ }).click();
    expect(await prisma.visit.count({ where: { leadId } })).toBe(0);

    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.getByPlaceholder(/Search by code, title/).fill(RUN);
    await page.getByRole("button", { name: "Select", exact: true }).first().click();
    await expect(page.getByTestId("completed-visit-property")).toContainText(PROPERTY_TITLE);

    await page.locator("select").filter({ has: page.locator(`option[value="${feId}"]`) }).last().selectOption(feId);
    await page.locator('input[type="date"]').last().fill(yesterday());
    await page.locator('input[type="time"]').last().fill("14:30");
    await page.getByRole("button", { name: /Log visit/ }).click();

    await expect.poll(async () => (await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("VISIT_COMPLETED");
    const visits = await prisma.visit.findMany({ where: { leadId }, include: { properties: true } });
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ status: "COMPLETED", propertyId, assignedToId: feId, visitTime: "14:30" });
    expect(visits[0].completedAt).not.toBeNull();
    expect(visits[0].properties).toHaveLength(1);
    expect(visits[0].properties[0].propertyId).toBe(propertyId);
    expect(JSON.stringify(await prisma.property.findUniqueOrThrow({ where: { id: propertyId } }))).toBe(propBefore);
    expect(await prisma.activity.count({ where: { leadId, type: "VISIT_COMPLETED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityType: "Visit", entityId: visits[0].id } })).toBeGreaterThan(0);

    await page.goto("/visits?tab=completed");
    await expect(page.getByText(`${RUN} Log Visit`).first()).toBeVisible();
    await page.goto(`/leads/${leadId}`);
    await page.getByRole("button", { name: /^Visit$/ }).first().click();
    await expect(page.getByText(PROPERTY_TITLE).first()).toBeVisible();
    expect(await prisma.visit.count({ where: { leadId } })).toBe(1);
    expect(networkGuard.unexpectedSendCalls).toEqual([]);
    assertNoBrowserErrors(withoutExpected409(errors));
  });

  test("responsive: dialog fits and the page does not overflow at 1440 and 390", async ({ page }) => {
    const leadId = await makeLead(page, "Responsive");
    for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      await page.goto(`/leads/${leadId}`);
      await statusSelect(page).selectOption("VISIT_COMPLETED");
      await expect(page.getByText("No visit on record")).toBeVisible();
      const box = await page.getByRole("dialog").boundingBox();
      expect(box, `dialog box @${size.width}`).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
      expect(await detectHorizontalOverflow(page), `${size.width}px`).toBeNull();
      await expect(page.getByRole("button", { name: /Log visit/ })).toBeVisible();
      await page.getByRole("button", { name: "Cancel" }).click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/visits?tab=completed");
    expect(await detectHorizontalOverflow(page)).toBeNull();
  });
});
