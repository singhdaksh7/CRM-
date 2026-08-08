import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("./api-auth", () => ({ ApiError: class ApiError extends Error { constructor(public status: number, message: string) { super(message); } } }));
import { inboxAccessWhere, sanitizeMediaFilename, validateInboundMedia } from "./whatsapp-inbox";

describe("WhatsApp inbox security helpers", () => {
  it("scopes administrators to the organization", () => expect(inboxAccessWhere({ id: "admin", role: "ADMIN" }, "org-a")).toEqual({ organizationId: "org-a" }));
  it("scopes data managers to the organization", () => expect(inboxAccessWhere({ id: "dm", role: "DATA_MANAGER" }, "org-a")).toEqual({ organizationId: "org-a" }));
  it("restricts field executives to assigned conversation or lead", () => expect(inboxAccessWhere({ id: "fe", role: "FIELD_EXECUTIVE" }, "org-a")).toEqual({ organizationId: "org-a", OR: [{ assignedToId: "fe" }, { lead: { assignedToId: "fe" } }] }));
  it("sanitizes traversal and spaces from filenames", () => expect(sanitizeMediaFilename("../../client contract (1).pdf")).toBe("client_contract__1_.pdf"));
  it("bounds sanitized filenames", () => expect(sanitizeMediaFilename("x".repeat(200))).toHaveLength(120));
  it("accepts safe JPEG images", () => expect(() => validateInboundMedia("IMAGE", "image/jpeg", 1024)).not.toThrow());
  it("accepts safe PDF documents", () => expect(() => validateInboundMedia("DOCUMENT", "application/pdf", 1024)).not.toThrow());
  it("rejects executable documents", () => expect(() => validateInboundMedia("DOCUMENT", "application/x-msdownload", 1024)).toThrow("Unsupported"));
  it("rejects SVG images", () => expect(() => validateInboundMedia("IMAGE", "image/svg+xml", 1024)).toThrow("Unsupported"));
  it("rejects files larger than 10 MB", () => expect(() => validateInboundMedia("IMAGE", "image/png", 10 * 1024 * 1024 + 1)).toThrow("10 MB"));
});
