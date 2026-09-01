import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let sessionUser: { id: string; role: string } = { id: "fe1", role: "FIELD_EXECUTIVE" };

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { MockApiError };
});

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    ApiError: MockApiError,
    requireSession: async () => ({ user: sessionUser }),
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err && typeof err === "object" && "issues" in err) return NextResponse.json({ error: "Validation failed" }, { status: 400 });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));

const captureFieldLocation = vi.fn();
vi.mock("@/lib/property-location", () => ({ captureFieldLocation: (...a: unknown[]) => captureFieldLocation(...a) }));

const { POST } = await import("./route");

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(body: unknown) {
  return new NextRequest(new Request("https://x.test/api/properties/p1/capture-location", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
  captureFieldLocation.mockResolvedValue({ id: "p1", latitude: 28.612, longitude: 77.229, locationPrecision: "EXACT" });
});

describe("POST /api/properties/[id]/capture-location (A7)", () => {
  it("forwards the captured coordinate/accuracy to captureFieldLocation with the actor's identity", async () => {
    const res = await POST(req({ latitude: 28.612, longitude: 77.229, accuracy: 15 }), params("p1"));
    expect(res.status).toBe(200);
    expect(captureFieldLocation).toHaveBeenCalledWith({
      propertyId: "p1",
      actorId: "fe1",
      organizationId: "org_default",
      role: "FIELD_EXECUTIVE",
      latitude: 28.612,
      longitude: 77.229,
      accuracy: 15,
    });
  });

  it("accepts a missing accuracy (some browsers omit it)", async () => {
    const res = await POST(req({ latitude: 28.612, longitude: 77.229 }), params("p1"));
    expect(res.status).toBe(200);
    expect(captureFieldLocation).toHaveBeenCalledWith(expect.objectContaining({ accuracy: null }));
  });

  it("rejects a malformed body (missing coordinates) with 400, never calling captureFieldLocation", async () => {
    const res = await POST(req({ accuracy: 10 }), params("p1"));
    expect(res.status).toBe(400);
    expect(captureFieldLocation).not.toHaveBeenCalled();
  });

  it("propagates a 403 from captureFieldLocation (unassigned executive)", async () => {
    captureFieldLocation.mockRejectedValue(new MockApiError(403, "You don't have an assigned visit or lead catalogue involving this property"));
    const res = await POST(req({ latitude: 28.612, longitude: 77.229 }), params("p1"));
    expect(res.status).toBe(403);
  });

  it("ADMIN can also call this route (management access is retained)", async () => {
    sessionUser = { id: "admin1", role: "ADMIN" };
    const res = await POST(req({ latitude: 28.612, longitude: 77.229 }), params("p1"));
    expect(res.status).toBe(200);
    expect(captureFieldLocation).toHaveBeenCalledWith(expect.objectContaining({ role: "ADMIN", actorId: "admin1" }));
  });
});
