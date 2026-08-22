import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * simplified-role-workflow - zero-auto-send guard (spec: "no new code path
 * auto-triggers WhatsApp on lead/follow-up/visit/catalogue/matching/reminder
 * creation; sending stays a manual button click").
 *
 * This walks the real source tree and asserts that the only files calling
 * the actual message-dispatch functions are the ones already known to sit
 * behind an explicit user-initiated action (a click on Send in
 * conversation-panel.tsx / the inbox / CataloguesTab's Send button, or the
 * provider implementations themselves). Every file added this pass
 * (todays-work.ts, dm-dashboard-data.ts, lead-phones.ts, the visit
 * complete/next-action flow, the follow-up routes) is deliberately absent
 * from the allowlist - if any of them started calling a send function, this
 * test fails.
 */

const SRC_ROOT = join(__dirname, "..");

const SEND_FUNCTION_PATTERN = /\b(sendOutboundMessage|sendTemplateMessage|sendCatalogueMessage|sendTextMessage)\s*\(/;

// Files allowed to reference a send function - either because they ARE the
// provider/implementation, or because they are the route/module directly
// behind an explicit manual "Send" click.
const ALLOWLIST = new Set([
  "integrations/whatsapp/click-to-chat-provider.ts",
  "integrations/whatsapp/meta-whatsapp-provider.ts",
  "integrations/whatsapp/mock-whatsapp-provider.ts",
  "integrations/whatsapp/whatsapp-types.ts", // interface declarations only
  "lib/whatsapp-messages.ts", // implements sendOutboundMessage, called only from the manual-send routes below
  "lib/catalogues.ts", // implements the manual [Send] catalogue action
  "app/api/leads/[id]/whatsapp/messages/route.ts", // POST hit only by conversation-panel.tsx's Send button
  "app/api/whatsapp/inbox/[id]/messages/route.ts", // POST hit only by the inbox's manual send
  "app/api/system/whatsapp-test-send/route.ts", // pre-existing ADMIN-only diagnostic "send a test message" tool - not tied to any lead/follow-up/visit/catalogue event
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

describe("zero-auto-send", () => {
  it("only the known manual-send code paths call a WhatsApp send function", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const rel = file.slice(SRC_ROOT.length + 1).replace(/\\/g, "/");
      if (ALLOWLIST.has(rel)) continue;
      const content = readFileSync(file, "utf-8");
      if (SEND_FUNCTION_PATTERN.test(content)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("none of this pass's new files (Today's Work, DM dashboard, phones, visit-complete flow, follow-up routes) touch a send function at all", () => {
    const newFiles = [
      "lib/todays-work.ts",
      "lib/dm-dashboard-data.ts",
      "lib/lead-phones.ts",
      "lib/catalogue-whatsapp-fallback.ts",
      "lib/catalogue-property-preferences.ts",
      "lib/visit-property-candidates.ts",
      "components/dashboard/todays-priorities-list.tsx",
      "components/dashboard/new-leads-panel.tsx",
      "components/dashboard/data-manager-dashboard.tsx",
      "components/visits/visit-property-workflow.tsx",
      "components/leads/lead-phone-picker.tsx",
      "components/leads/lead-phones-panel.tsx",
      "components/leads/client-preferences-panel.tsx",
      "components/leads/visit-schedule-with-candidates.tsx",
      "app/api/follow-ups/route.ts",
      "app/api/follow-ups/[id]/route.ts",
      "app/api/catalogues/whatsapp-fallback/route.ts",
    ];
    for (const rel of newFiles) {
      const content = readFileSync(join(SRC_ROOT, rel), "utf-8");
      expect(SEND_FUNCTION_PATTERN.test(content), `${rel} should not call a send function`).toBe(false);
    }
  });
});
