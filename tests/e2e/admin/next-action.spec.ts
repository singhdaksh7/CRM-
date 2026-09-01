import { test, expect } from "../fixtures/network-guard";
import { getQaLeadId, QA_LEAD_NAMES } from "../fixtures/qa-data";

/**
 * Asserts the actual rendered "Next Action Recommended" banner on the Lead
 * Workspace overview tab for each deterministic seeded state - never
 * re-derives getNextAction's own logic, only reads the DOM it produces.
 */
const CASES: { key: keyof typeof QA_LEAD_NAMES; expectedLabel: string | null }[] = [
  { key: "new", expectedLabel: "Complete Requirement" },
  { key: "pendingOutcome", expectedLabel: "Record Outcome" },
  { key: "likedNoVisit", expectedLabel: "Schedule Visit" },
  { key: "unsharedMatch", expectedLabel: "Share Properties" },
  { key: "noMatches", expectedLabel: "No Matches Yet" },
  { key: "closedWon", expectedLabel: null },
];

test.describe("Lead Workspace - Next Action", () => {
  for (const { key, expectedLabel } of CASES) {
    test(`${QA_LEAD_NAMES[key]} -> ${expectedLabel ?? "no CTA"}`, async ({ page }) => {
      const leadId = await getQaLeadId(QA_LEAD_NAMES[key]);
      await page.goto(`/leads/${leadId}`);
      await expect(page.getByText(QA_LEAD_NAMES[key])).toBeVisible();

      if (expectedLabel) {
        await expect(page.getByText("Next Action Recommended")).toBeVisible();
        await expect(page.getByRole("heading", { name: expectedLabel, level: 4 })).toBeVisible();
      } else {
        await expect(page.getByText("Next Action Recommended")).not.toBeVisible();
      }
    });
  }
});
