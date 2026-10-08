import { PrismaClient } from "@prisma/client";
import { test, expect } from "../fixtures/network-guard";
import { assertNoBrowserErrors } from "../helpers/browser-errors";
import { detectHorizontalOverflow } from "../helpers/overflow";

/**
 * Focused browser verification for: 1 RK (bhk=0) filtering/labels, OLX lead source,
 * and manual "Visit Completed" lead-status sync. All rows are created locally (QA DB
 * only, enforced by the global safety guard) and carry RUN so they can be removed.
 */
const prisma = new PrismaClient();
const RUN = `QA1RK${Date.now().toString(36)}`;
const T = { rk: `${RUN} Studio RK`, bhk1: `${RUN} One BHK`, bhk2: `${RUN} Two BHK`, comm: `${RUN} Commercial Zero` };
const created = { propertyIds: [] as string[], leadIds: [] as string[] };

function propertyBody(title: string, bhk: number) {
  return {
    title, propertyType: "APARTMENT", listingType: "RENT", assetClass: "RESIDENTIAL", status: "AVAILABLE",
    description: "QA synthetic", city: "Delhi", area: `${RUN} Area`, address: `${RUN} Lane`,
    monthlyRent: 15000, securityDeposit: 30000, bhk, bathrooms: 1, furnishing: "SEMI_FURNISHED",
    builtUpAreaSqft: 300 + bhk * 200, parkingAvailable: false, ownerName: "QA Owner", ownerPhone: "+911000099002",
    inventorySource: "DIRECT", amenities: [], images: [],
  };
}

test.describe.serial("1 RK / OLX / Visit Completed", () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/admin.json" });
    const res = ctx.request;
    for (const [title, bhk] of [[T.rk, 0], [T.bhk1, 1], [T.bhk2, 2], [T.comm, 0]] as const) {
      const r = await res.post("/api/properties", { data: propertyBody(title, bhk) });
      expect(r.status(), `create ${title}`).toBeLessThan(300);
      const id = (await r.json()).property.id as string;
      created.propertyIds.push(id);
    }
    // Make the last one a commercial record that still carries the internal bhk=0.
    await prisma.property.update({ where: { id: created.propertyIds[3] }, data: { assetClass: "COMMERCIAL", propertyType: "SHOP", bhk: 0 } });
    await ctx.close();
  });

  test.afterAll(async () => {
    await prisma.visit.deleteMany({ where: { leadId: { in: created.leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: created.leadIds } } });
    await prisma.property.deleteMany({ where: { id: { in: created.propertyIds } } });
    await prisma.$disconnect();
  });

  test("Properties filter: 1 RK returns only residential bhk=0, count matches, clearing restores", async ({ page, errors }) => {
    await page.goto(`/properties?status=ALL&q=${RUN}`);
    await expect(page.getByText(T.rk).first()).toBeVisible();
    await expect(page.getByText(T.comm).first()).toBeVisible();

    const bhkSelect = page.locator("select").filter({ has: page.locator('option:text-is("1 RK")') }).first();
    if (!(await bhkSelect.isVisible())) await page.getByRole("button", { name: /more filters|filters/i }).first().click();
    await expect(bhkSelect.locator("option")).toContainText(["All BHK", "1 RK", "1 BHK", "2 BHK"]);
    await bhkSelect.selectOption("0");
    await expect(page).toHaveURL(/bhk=0/);

    await expect(page.getByText(T.rk).first()).toBeVisible();
    await expect(page.getByText(T.bhk1)).toHaveCount(0);
    await expect(page.getByText(T.bhk2)).toHaveCount(0);
    await expect(page.getByText(T.comm)).toHaveCount(0);
    await expect(page.getByText("1 RK").locator("visible=true").first()).toBeVisible();
    await expect(page.getByText("0 BHK")).toHaveCount(0);
    await expect(page.getByText(/\b1 matching listings\b/)).toBeVisible();

    await bhkSelect.selectOption("1");
    await expect(page).toHaveURL(/bhk=1/);
    await expect(page.getByText(T.bhk1).first()).toBeVisible();
    await expect(page.getByText(T.rk)).toHaveCount(0);

    await bhkSelect.selectOption("2");
    await expect(page.getByText(T.bhk2).first()).toBeVisible();
    await expect(page.getByText(T.bhk1)).toHaveCount(0);

    await bhkSelect.selectOption("");
    await expect(page.getByText(T.rk).first()).toBeVisible();
    await expect(page.getByText(T.comm).first()).toBeVisible();

    // Invalid value applies no BHK filter (must not become 0).
    await page.goto(`/properties?status=ALL&q=${RUN}&bhk=abc`);
    await expect(page.getByText(T.bhk1).first()).toBeVisible();
    await expect(page.getByText(T.comm).first()).toBeVisible();
    assertNoBrowserErrors(errors);
  });

  test("Commercial bhk=0 never renders as 1 RK / 0 BHK; 1 RK property detail edits as 1 RK", async ({ page, errors }) => {
    await page.goto(`/properties/${created.propertyIds[3]}`);
    await expect(page.getByText(T.comm).first()).toBeVisible();
    await expect(page.getByText("1 RK")).toHaveCount(0);
    await expect(page.getByText("0 BHK")).toHaveCount(0);

    await page.goto(`/properties/${created.propertyIds[0]}`);
    await expect(page.getByText("1 RK").locator("visible=true").first()).toBeVisible();
    await expect(page.getByText("0 BHK")).toHaveCount(0);

    await page.goto(`/properties/${created.propertyIds[0]}/edit`);
    const bhk = page.locator("select").filter({ has: page.locator('option:text-is("1 RK")') }).first();
    await expect(bhk).toHaveValue("0");
    assertNoBrowserErrors(errors);
  });

  test("OLX in lead form + filter; 1 RK option; OLX lead persists and filters", async ({ page, errors }) => {
    await page.goto("/leads/new");
    await expect(page.locator('option[value="OLX"]').first()).toBeAttached();
    await expect(page.locator('option:text-is("1 RK")').first()).toBeAttached();

    const r = await page.request.post("/api/leads", {
      data: {
        clientName: `${RUN} OLX Lead`, phone: "9000000077", source: "OLX", requirementType: "RENT",
        assetClass: "RESIDENTIAL", preferredLocation: `${RUN} Area`, minBudget: 5000, maxBudget: 20000,
        preferredBhk: 0, priority: "WARM",
      },
    });
    expect(r.status()).toBeLessThan(300);
    const id = (await r.json()).lead.id as string;
    created.leadIds.push(id);
    const row = await prisma.lead.findUniqueOrThrow({ where: { id } });
    expect(row.source).toBe("OLX");
    expect(row.preferredBhk).toBe(0);

    await page.goto("/leads?source=OLX");
    await expect(page.getByText(`${RUN} OLX Lead`).first()).toBeVisible();
    await page.goto("/leads?source=MANUAL");
    await expect(page.getByText(`${RUN} OLX Lead`)).toHaveCount(0);

    await page.goto(`/leads/${id}`);
    await expect(page.getByText("1 RK").locator("visible=true").first()).toBeVisible();
    await expect(page.getByText("0 BHK")).toHaveCount(0);
    await expect(page.getByText(/olx/i).locator("visible=true").first()).toBeVisible();
    assertNoBrowserErrors(errors);
  });

  test("Lead -> Visit Completed completes the single active visit; no duplicate; no property change", async ({ page, networkGuard, errors }) => {
    const fe = await prisma.user.findFirstOrThrow({ where: { email: "qa.fe@example.test" } });
    const r = await page.request.post("/api/leads", {
      data: {
        clientName: `${RUN} Visit Lead`, phone: "9000000088", source: "MANUAL", requirementType: "RENT",
        assetClass: "RESIDENTIAL", preferredLocation: `${RUN} Area`, minBudget: 5000, maxBudget: 20000,
        preferredBhk: 1, priority: "WARM", assignedToId: fe.id,
      },
    });
    expect(r.status()).toBeLessThan(300);
    const leadId = (await r.json()).lead.id as string;
    created.leadIds.push(leadId);

    const propId = created.propertyIds[1];
    const propBefore = JSON.stringify(await prisma.property.findUniqueOrThrow({ where: { id: propId } }));
    const when = new Date(Date.now() + 86_400_000);
    const done = await prisma.visit.create({ data: { organizationId: "org_default", leadId, propertyId: propId, assignedToId: fe.id, createdById: fe.id, visitDate: new Date(Date.now() - 5 * 86_400_000), visitTime: "10:00", status: "COMPLETED", completedAt: new Date(Date.now() - 5 * 86_400_000), properties: { create: [{ propertyId: propId }] } } });
    const cancelled = await prisma.visit.create({ data: { organizationId: "org_default", leadId, propertyId: propId, assignedToId: fe.id, createdById: fe.id, visitDate: new Date(Date.now() - 3 * 86_400_000), visitTime: "10:00", status: "CANCELLED", properties: { create: [{ propertyId: propId }] } } });
    const active = await prisma.visit.create({ data: { organizationId: "org_default", leadId, propertyId: propId, assignedToId: fe.id, createdById: fe.id, visitDate: when, visitTime: "11:00", status: "SCHEDULED", properties: { create: [{ propertyId: propId }] } } });
    const doneBefore = JSON.stringify(await prisma.visit.findUniqueOrThrow({ where: { id: done.id } }));
    const cancelledBefore = JSON.stringify(await prisma.visit.findUniqueOrThrow({ where: { id: cancelled.id } }));

    const waBefore = await prisma.whatsAppMessage.count();
    const patch = await page.request.patch(`/api/leads/${leadId}`, { data: { status: "VISIT_COMPLETED" } });
    expect(patch.status()).toBeLessThan(300);

    const visits = await prisma.visit.findMany({ where: { leadId }, orderBy: { createdAt: "asc" } });
    expect(visits).toHaveLength(3);
    expect(visits.find((v) => v.id === active.id)?.status).toBe("COMPLETED");
    expect(JSON.stringify(visits.find((v) => v.id === done.id))).toBe(doneBefore);
    expect(JSON.stringify(visits.find((v) => v.id === cancelled.id))).toBe(cancelledBefore);
    expect(JSON.stringify(await prisma.property.findUniqueOrThrow({ where: { id: propId } }))).toBe(propBefore);
    expect(await prisma.activity.count({ where: { leadId, description: { contains: "Visit completed from lead status change" } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityType: "Visit", entityId: active.id } })).toBeGreaterThan(0);

    await page.goto(`/visits/${active.id}`);
    await expect(page.getByText(/completed/i).first()).toBeVisible();
    await page.goto(`/leads/${leadId}`);
    // Activity timeline lives under a tab; open it if the entry is not on the default view.
    const entry = page.getByText(/Visit completed from lead status change/i).first();
    await page.getByRole("button", { name: /^More$/ }).or(page.getByRole("tab", { name: /^More$/ })).first().click();
    await page.getByRole("button", { name: "Activity Timeline" }).click();
    await expect(entry).toBeVisible();
    expect(networkGuard.unexpectedSendCalls).toEqual([]);
    expect(await prisma.whatsAppMessage.count()).toBe(waBefore);
    assertNoBrowserErrors(errors);
  });

  test("responsive: no horizontal overflow at 1440 / 390 on affected pages", async ({ page }) => {
    for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      for (const path of [`/properties?status=ALL&q=${RUN}&bhk=0`, "/leads?source=OLX", "/leads/new", "/properties/new", `/properties/${created.propertyIds[0]}`]) {
        await page.goto(path);
        await page.waitForLoadState("domcontentloaded");
        expect(await detectHorizontalOverflow(page), `${size.width}px ${path}`).toBeNull();
      }
    }
  });
});
