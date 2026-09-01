import { test, expect } from "../fixtures/network-guard";
import { getQaLeadId, QA_LEAD_NAMES } from "../fixtures/qa-data";

/**
 * Uses the "Valid Unshared Match" lead - scheduling/completing a follow-up
 * here never touches matchRecommendations or sharedProperties, so this
 * stays safe alongside the Next Action spec's assertions on that same lead.
 */
async function scheduleFollowUp(page: import("@playwright/test").Page, isoDate: string) {
  await page.locator('input[type="date"]').first().fill(isoDate);
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/follow-ups") && res.request().method() === "POST"),
    page.getByRole("button", { name: "Schedule", exact: true }).click(),
  ]);
  expect(response.status()).toBeLessThan(300);
  await page.waitForLoadState("networkidle");
}

test.describe("Follow-up lifecycle", () => {
  test("schedule, verify due-today grouping, and complete", async ({ page, networkGuard }) => {
    const leadId = await getQaLeadId(QA_LEAD_NAMES.unsharedMatch);
    await page.goto(`/leads/${leadId}`);
    await page.getByRole("button", { name: "Follow-up", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Add Follow-up" })).toBeVisible();

    const today = new Date().toISOString().slice(0, 10);
    await scheduleFollowUp(page, today);

    // Persisted: appears in the History list with a PENDING badge.
    await expect(page.getByText("Pending", { exact: false }).first()).toBeVisible();

    // Refresh persistence.
    await page.reload();
    await page.getByRole("button", { name: "Follow-up", exact: true }).click();
    await expect(page.getByText("Pending", { exact: false }).first()).toBeVisible();

    // Complete via the lead workspace's checkmark control - same page, no
    // extra navigation in between (avoids interleaving an unrelated route
    // change with the in-flight PATCH/refresh cycle).
    const [completeResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/follow-ups/") && res.request().method() === "PATCH"),
      page.getByTitle("Mark completed").first().click(),
    ]);
    expect(completeResponse.status()).toBeLessThan(300);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Completed", { exact: false }).first()).toBeVisible();

    // Completed state survives a refresh too.
    await page.reload();
    await page.getByRole("button", { name: "Follow-up", exact: true }).click();
    await expect(page.getByText("Completed", { exact: false }).first()).toBeVisible();

    // Due-today grouping, on the dedicated Follow-ups module page - checked
    // last so it doesn't interleave with the PATCH/refresh cycle above.
    await page.goto("/follow-ups?bucket=today");
    await expect(page.getByText(/Due Today/i).first()).toBeVisible();

    expect(networkGuard.unexpectedSendCalls, "no automatic customer communication during follow-up scheduling/completion").toEqual([]);
  });

  test("overdue grouping: a past-dated follow-up appears in the overdue bucket", async ({ page }) => {
    const leadId = await getQaLeadId(QA_LEAD_NAMES.unsharedMatch);
    await page.goto(`/leads/${leadId}`);
    await page.getByRole("button", { name: "Follow-up", exact: true }).click();

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await scheduleFollowUp(page, yesterday);
    await expect(page.getByText("Pending", { exact: false }).first()).toBeVisible();

    await page.goto("/follow-ups?bucket=overdue");
    await expect(page.getByText(/Overdue/i).first()).toBeVisible();
    await expect(page.getByText(QA_LEAD_NAMES.unsharedMatch)).toBeVisible();
  });
});
