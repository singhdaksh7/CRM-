import { describe, expect, it } from "vitest";
import { identifyAuthorizedEmailProvider, portalEmailEventId } from "./email-ingestion";

const email = { messageId: "<provider-message-1>", from: "leads@olx.example", subject: "Lead", receivedAt: new Date(), text: "sanitized fixture" };
describe("authorized portal email framework", () => {
  it("does not trust an unconfigured sender merely by its display/domain claim", () => expect(identifyAuthorizedEmailProvider(email, {})).toBeNull());
  it("identifies only explicitly configured sender rules", () => expect(identifyAuthorizedEmailProvider(email, { OLX: ["olx.example"] })).toBe("OLX"));
  it("uses a stable provider-message idempotency key", () => expect(portalEmailEventId(email)).toBe(portalEmailEventId({ ...email })));
});
