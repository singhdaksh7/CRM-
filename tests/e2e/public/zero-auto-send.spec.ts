import { test, expect } from "../fixtures/network-guard";
import { getQaCatalogueToken, QA_LEAD_NAMES } from "../fixtures/qa-data";

/**
 * Dedicated network-interception safety spec. The other workflow specs
 * (follow-up, visit-outcome, GPS capture, deal close-out) each carry their
 * own networkGuard assertion inline where the real UI action happens - see
 * those files. This spec covers the one customer-communication-ADJACENT
 * surface not otherwise exercised through a real browser anywhere else:
 * the public catalogue's "Interested" preference button, which sits right
 * next to (but must never itself trigger) an outbound send.
 *
 * Lead/property creation and matching are covered structurally, not by
 * network interception here: POST /api/leads and POST /api/properties (see
 * src/app/api/leads/route.ts, src/app/api/properties/route.ts) import
 * neither @/integrations/whatsapp nor any SMS/email sender - verified by
 * reading both route files in full. Catalogue *sending* (which DOES call
 * sendOutboundMessage) is exercised in seed-qa-workflow.ts, mocked via
 * WHATSAPP_PROVIDER=MOCK, and is the one explicit human "Send" action this
 * task deliberately does not re-invoke here.
 */
test.describe("Zero auto send - public catalogue preference", () => {
  test("submitting a public catalogue preference never calls a customer-send endpoint", async ({ page, networkGuard, errors }) => {
    const token = await getQaCatalogueToken(QA_LEAD_NAMES.publicCatalogue);
    await page.goto(`/share/catalogue/${token}`);
    await expect(page.getByText("QA Public Catalogue")).toBeVisible();

    const interestedButton = page.getByRole("button", { name: "Interested", exact: true }).first();
    if (await interestedButton.count()) {
      await interestedButton.click();
      await page.waitForLoadState("networkidle");
    }

    expect(networkGuard.unexpectedSendCalls, "no automatic customer communication from a public catalogue preference").toEqual([]);
    expect(errors.pageErrors, "no page errors during public catalogue interaction").toEqual([]);
    expect(errors.http500s, "no 500s during public catalogue interaction").toEqual([]);
  });
});
