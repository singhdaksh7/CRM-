import path from "path";
import { test, expect } from "../fixtures/network-guard";
import { getQaDealId, getQaPropertyId, QA_LEAD_NAMES, QA_PROPERTY_TITLES } from "../fixtures/qa-data";

/**
 * transitionDealStage (src/lib/deals.ts) enforces server-side that only
 * ADMIN/DATA_MANAGER may transition a deal to CLOSED_WON/CLOSED_LOST - a
 * FIELD_EXECUTIVE gets a 403 even via a direct API call, not just a hidden
 * button (DealActions itself also returns null client-side for them). This
 * spec verifies both layers, and never weakens either.
 */
test.describe("Deal close-out", () => {
  test("authorized admin close-out: Deal WON, Lead CLOSED_WON, target property closed, unrelated property unchanged", async ({ page, networkGuard }) => {
    const dealId = await getQaDealId(QA_LEAD_NAMES.dealWorkflow);
    const unrelatedPropertyId = await getQaPropertyId(QA_PROPERTY_TITLES.B);

    await page.goto(`/deals/${dealId}`);
    await expect(page.getByRole("heading", { name: /QA Lead - Deal Workflow/ })).toBeVisible();

    // Idempotency guard: a Playwright retry re-runs this whole test against
    // the SAME persisted deal (unlike a fresh browser context, DB state
    // survives across retries) - if an earlier attempt's close already
    // succeeded server-side (only the page assertion failed), skip straight
    // to verification rather than attempting a second close and hitting a
    // legitimate 409 "Deal is already won".
    const alreadyClosed = await page.getByText("CLOSED_WON", { exact: true }).count();
    if (!alreadyClosed) {
      await page.getByLabel("Internal note").fill("QA deterministic close-out - synthetic data.");
      await page.getByLabel("Final amount").fill("27000");
      await page.getByLabel("Expected brokerage").fill("27000");
      await page.getByLabel("KP share %").fill("100");
      // Closing date defaults to today already; leave as-is.
      const [stageResponse] = await Promise.all([
        page.waitForResponse((res) => res.url().includes("/api/deals/") && res.url().includes("/stage") && res.request().method() === "POST"),
        page.getByRole("button", { name: "Close Won" }).click(),
      ]);
      expect(stageResponse.status(), await stageResponse.text().catch(() => "")).toBeLessThan(300);
      await expect(page.getByText(/Stage updated/)).toBeVisible();
      await page.reload();
    }

    // "CLOSED_WON" also appears inside the append-only Timeline text once
    // closed, alongside the "Current stage" line - .first() avoids the
    // resulting strict-mode ambiguity (either match proves the same fact).
    await expect(page.getByText("CLOSED_WON", { exact: true }).first()).toBeVisible();

    // Verify persisted state directly - the authoritative source of truth,
    // independent of how the page happens to render it.
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, include: { lead: true, property: true } });
      expect(deal.status).toBe("WON");
      expect(deal.stage).toBe("CLOSED_WON");
      expect(deal.lead?.status).toBe("CLOSED_WON");
      expect(deal.property?.status).toBe("RENTED"); // RENT listing -> RENTED, not SOLD

      const unrelated = await prisma.property.findUniqueOrThrow({ where: { id: unrelatedPropertyId } });
      expect(unrelated.status).toBe("AVAILABLE");
    } finally {
      await prisma.$disconnect();
    }

    expect(networkGuard.unexpectedSendCalls, "no automatic customer communication during deal close-out").toEqual([]);
  });
});

test.describe("Deal close-out - FE authorization", () => {
  test.use({ storageState: path.join(__dirname, "..", ".auth", "field-executive.json") });

  test("FIELD_EXECUTIVE gets no close-out UI and a server-side 403 on a direct attempt", async ({ page }) => {
    const dealId = await getQaDealId(QA_LEAD_NAMES.dealWorkflow);

    await page.goto(`/deals/${dealId}`);
    // DealActions returns null entirely for a non-manage viewer.
    await expect(page.getByRole("button", { name: "Close Won" })).not.toBeVisible();
    await expect(page.getByText("Negotiation actions")).not.toBeVisible();

    const status = await page.evaluate(async (id) => {
      const r = await fetch(`/api/deals/${id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "CLOSED_WON", agreedAmount: 1, closingDate: new Date().toISOString().slice(0, 10), closingNotes: "attempt", expectedBrokerageAmount: 1, kpSharePct: 100 }),
      });
      return r.status;
    }, dealId);
    expect(status).toBe(403);
  });
});
