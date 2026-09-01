import { test, expect } from "../fixtures/network-guard";
import { getQaLeadId, getQaVisitId, QA_LEAD_NAMES } from "../fixtures/qa-data";

/**
 * Uses the dedicated "Visit Outcome Workflow" lead/visit (seed-qa-release-
 * candidate.ts) - deliberately NOT the "Pending Visit Outcome" lead the
 * Next Action spec depends on staying pristine (no-outcome) forever.
 * VisitRowActions (status + outcome selects) is manage-gated (ADMIN/
 * DATA_MANAGER only) - this spec runs as admin.
 */
test.describe("Visit Outcome", () => {
  test("recording an outcome updates status, persists, and clears the Record Outcome next action", async ({ page, networkGuard }) => {
    const leadId = await getQaLeadId(QA_LEAD_NAMES.visitOutcome);
    const visitId = await getQaVisitId(QA_LEAD_NAMES.visitOutcome);

    // Deterministic setup only - resets this visit/lead back to their
    // pre-outcome seeded state before every run, so "Record Outcome" is
    // guaranteed to be the starting Next Action regardless of what an
    // earlier run (against this same persistent local DB) already
    // recorded. The recording steps below still exercise the real UI ->
    // PATCH /api/visits/[id] path end to end - this only resets the
    // starting point being tested from.
    {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      try {
        await prisma.visit.update({ where: { id: visitId }, data: { status: "SCHEDULED", outcome: null } });
        await prisma.lead.update({ where: { id: leadId }, data: { status: "VISIT_SCHEDULED" } });
      } finally {
        await prisma.$disconnect();
      }
    }

    // Before: the lead's Next Action is "Record Outcome" (past visit, no outcome).
    await page.goto(`/leads/${leadId}`);
    await expect(page.getByRole("heading", { name: "Record Outcome", level: 4 })).toBeVisible();

    // Record the outcome on the visit detail page. Each select independently
    // PATCHes and router.refresh()es (visit-row-actions.tsx) - waiting for
    // that exact response, not just the toast text, avoids a race where the
    // first refresh remounts the (uncontrolled, defaultValue-based) selects
    // while the second interaction is still in flight.
    await page.goto(`/visits/${visitId}`);
    const statusAndOutcome = page.locator("section, div").filter({ hasText: "Status & outcome" }).last();
    await expect(statusAndOutcome).toBeVisible();

    const outcomeSelect = statusAndOutcome.locator('select:has(option[value="HIGHLY_INTERESTED"])');
    const [outcomeResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes(`/api/visits/${visitId}`) && res.request().method() === "PATCH"),
      outcomeSelect.selectOption("HIGHLY_INTERESTED"),
    ]);
    expect(outcomeResponse.status()).toBeLessThan(300);
    await page.waitForLoadState("networkidle");

    const statusSelectAfterOutcome = page.locator("section, div").filter({ hasText: "Status & outcome" }).last().locator('select:has(option[value="COMPLETED"])');
    const [statusResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes(`/api/visits/${visitId}`) && res.request().method() === "PATCH"),
      statusSelectAfterOutcome.selectOption("COMPLETED"),
    ]);
    expect(statusResponse.status()).toBeLessThan(300);
    await page.waitForLoadState("networkidle");

    // Persists across a reload.
    await page.reload();
    const statusAndOutcomeAfterReload = page.locator("section, div").filter({ hasText: "Status & outcome" }).last();
    await expect(statusAndOutcomeAfterReload.locator('select:has(option[value="COMPLETED"])')).toHaveValue("COMPLETED");
    await expect(statusAndOutcomeAfterReload.locator('select:has(option[value="HIGHLY_INTERESTED"])')).toHaveValue("HIGHLY_INTERESTED");

    // Lead Workspace: Next Action moved on (no longer "Record Outcome" - the
    // pendingOutcomeVisit condition is now false) and the visit's outcome is
    // reflected in the visit list.
    await page.goto(`/leads/${leadId}`);
    await expect(page.getByText("Record Outcome", { exact: true })).not.toBeVisible();

    expect(networkGuard.unexpectedSendCalls, "no automatic customer communication during visit outcome recording").toEqual([]);
  });
});
