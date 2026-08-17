import { describe, expect, it } from "vitest";
import { resolvePortalLead } from "./ingestion";

describe("portal lead resolution", () => {
  it("creates only when no strong identity signal exists", () => expect(resolvePortalLead([])).toBe("NEW"));
  it("links an exact single candidate", () => expect(resolvePortalLead([{ id: "a", clientName: "A" }])).toBe("MATCHED_EXISTING"));
  it("requires human review for more than one candidate", () => expect(resolvePortalLead([{ id: "a", clientName: "A" }, { id: "b", clientName: "B" }])).toBe("AMBIGUOUS"));
});
