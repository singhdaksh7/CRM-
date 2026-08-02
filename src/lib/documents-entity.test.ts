import { describe, it, expect } from "vitest";
import { documentEntityField } from "./documents-entity";

describe("documentEntityField", () => {
  it("maps every DocumentEntityType to its Document foreign-key column", () => {
    expect(documentEntityField("PROPERTY")).toBe("propertyId");
    expect(documentEntityField("LEAD")).toBe("leadId");
    expect(documentEntityField("OWNER")).toBe("ownerId");
    expect(documentEntityField("DEAL")).toBe("dealId");
    expect(documentEntityField("PAYMENT")).toBe("paymentId");
  });
});
