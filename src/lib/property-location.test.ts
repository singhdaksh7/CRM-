import { describe, it, expect, vi, beforeEach } from "vitest";

const propertyFindFirst = vi.fn();
const propertyUpdate = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    property: {
      findFirst: (...a: unknown[]) => propertyFindFirst(...a),
      update: (...a: unknown[]) => propertyUpdate(...a),
    },
  },
}));

vi.mock("./api-auth", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("./organization", () => ({ getOrganizationId: () => "org_default" }));
const recordAudit = vi.fn();
vi.mock("./audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

const geocodeAddressCached = vi.fn();
vi.mock("./geocoding", () => ({ geocodeAddressCached: (...a: unknown[]) => geocodeAddressCached(...a) }));

const fieldExecutiveHasPropertyAccess = vi.fn();
vi.mock("./property-access", () => ({ fieldExecutiveHasPropertyAccess: (...a: unknown[]) => fieldExecutiveHasPropertyAccess(...a) }));

const {
  geocodeProperty,
  setManualPropertyLocation,
  markPropertyLocationApproximate,
  setPublicLocationMode,
  clearPropertyLocation,
  captureFieldLocation,
} = await import("./property-location");
const { ApiError } = await import("./api-auth");
const { MapsConfigError } = await import("@/integrations/maps");

beforeEach(() => {
  vi.clearAllMocks();
});

function baseProperty(overrides: Record<string, unknown> = {}) {
  return { id: "prop1", address: "123 Main St", area: "Janakpuri", city: "Delhi", publicLocationMode: "LOCALITY_ONLY", ...overrides };
}

describe("geocodeProperty", () => {
  it("Field Executive is denied", async () => {
    await expect(geocodeProperty({ propertyId: "prop1", actorId: "fe1", organizationId: "org_default", role: "FIELD_EXECUTIVE" })).rejects.toThrow(ApiError);
    expect(propertyFindFirst).not.toHaveBeenCalled();
  });

  it("throws 404 for a nonexistent property", async () => {
    propertyFindFirst.mockResolvedValue(null);
    await expect(geocodeProperty({ propertyId: "missing", actorId: "admin1", organizationId: "org_default", role: "ADMIN" })).rejects.toThrow(ApiError);
  });

  it("saves coordinates and marks SUCCESS on a precise match", async () => {
    propertyFindFirst.mockResolvedValue(baseProperty());
    geocodeAddressCached.mockResolvedValue([{ formattedAddress: "123 Main St, Janakpuri, Delhi", placeId: "p1", location: { latitude: 28.6, longitude: 77.08 }, isPreciseMatch: true }]);
    propertyUpdate.mockResolvedValue({ id: "prop1", locationPrecision: "EXACT" });

    const result = await geocodeProperty({ propertyId: "prop1", actorId: "admin1", organizationId: "org_default", role: "ADMIN" });
    expect(result.locationPrecision).toBe("EXACT");
    expect(propertyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ geocodeStatus: "SUCCESS", latitude: 28.6, longitude: 77.08, locationPrecision: "EXACT" }) })
    );
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ event: "property_geocoded" }) }));
  });

  it("marks FAILED and throws when there are no results", async () => {
    propertyFindFirst.mockResolvedValue(baseProperty());
    geocodeAddressCached.mockResolvedValue([]);
    propertyUpdate.mockResolvedValue({});

    await expect(geocodeProperty({ propertyId: "prop1", actorId: "admin1", organizationId: "org_default", role: "ADMIN" })).rejects.toThrow(/No matching location/);
    expect(propertyUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { geocodeStatus: "FAILED" } }));
  });

  it("returns a safe 503 when maps is not configured, without exposing internals", async () => {
    propertyFindFirst.mockResolvedValue(baseProperty());
    geocodeAddressCached.mockRejectedValue(new MapsConfigError("Maps integration is not configured"));
    propertyUpdate.mockResolvedValue({});

    await expect(geocodeProperty({ propertyId: "prop1", actorId: "admin1", organizationId: "org_default", role: "ADMIN" })).rejects.toThrow(ApiError);
  });

  it("never includes the full address in the audit log", async () => {
    propertyFindFirst.mockResolvedValue(baseProperty());
    geocodeAddressCached.mockResolvedValue([{ formattedAddress: "123 Main St, Janakpuri, Delhi", placeId: "p1", location: { latitude: 28.6, longitude: 77.08 }, isPreciseMatch: false }]);
    propertyUpdate.mockResolvedValue({ locationPrecision: "APPROXIMATE" });

    await geocodeProperty({ propertyId: "prop1", actorId: "admin1", organizationId: "org_default", role: "ADMIN" });
    const auditCall = recordAudit.mock.calls[0][0];
    expect(JSON.stringify(auditCall)).not.toContain("123 Main St");
  });
});

describe("setManualPropertyLocation", () => {
  it("Data Manager can set a manual coordinate", async () => {
    propertyFindFirst.mockResolvedValue(baseProperty());
    propertyUpdate.mockResolvedValue({ id: "prop1", latitude: 28.6, longitude: 77.1 });

    const result = await setManualPropertyLocation({ propertyId: "prop1", actorId: "dm1", organizationId: "org_default", role: "DATA_MANAGER", latitude: 28.6, longitude: 77.1 });
    expect(result.latitude).toBe(28.6);
    expect(propertyUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ geocodeStatus: "MANUAL", locationPrecision: "EXACT" }) }));
  });

  it("rejects invalid coordinates", async () => {
    await expect(setManualPropertyLocation({ propertyId: "prop1", actorId: "admin1", organizationId: "org_default", role: "ADMIN", latitude: 999, longitude: 77.1 })).rejects.toThrow(ApiError);
    expect(propertyFindFirst).not.toHaveBeenCalled();
  });

  it("Field Executive is denied", async () => {
    await expect(setManualPropertyLocation({ propertyId: "prop1", actorId: "fe1", organizationId: "org_default", role: "FIELD_EXECUTIVE", latitude: 28.6, longitude: 77.1 })).rejects.toThrow(ApiError);
  });
});

describe("markPropertyLocationApproximate", () => {
  it("updates locationPrecision to APPROXIMATE", async () => {
    propertyFindFirst.mockResolvedValue(baseProperty());
    propertyUpdate.mockResolvedValue({ locationPrecision: "APPROXIMATE" });
    const result = await markPropertyLocationApproximate({ propertyId: "prop1", actorId: "admin1", organizationId: "org_default", role: "ADMIN" });
    expect(result.locationPrecision).toBe("APPROXIMATE");
  });
});

describe("setPublicLocationMode", () => {
  it("audits as exact_location_hidden when narrowing to HIDDEN", async () => {
    propertyFindFirst.mockResolvedValue(baseProperty({ publicLocationMode: "EXACT" }));
    propertyUpdate.mockResolvedValue({ publicLocationMode: "HIDDEN" });
    await setPublicLocationMode({ propertyId: "prop1", actorId: "admin1", organizationId: "org_default", role: "ADMIN", mode: "HIDDEN" });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ event: "exact_location_hidden" }) }));
  });

  it("Field Executive is denied", async () => {
    await expect(setPublicLocationMode({ propertyId: "prop1", actorId: "fe1", organizationId: "org_default", role: "FIELD_EXECUTIVE", mode: "EXACT" })).rejects.toThrow(ApiError);
  });
});

describe("clearPropertyLocation", () => {
  it("clears coordinate/geocode fields but records the event", async () => {
    propertyFindFirst.mockResolvedValue(baseProperty());
    propertyUpdate.mockResolvedValue({ latitude: null, longitude: null });
    const result = await clearPropertyLocation({ propertyId: "prop1", actorId: "admin1", organizationId: "org_default", role: "ADMIN" });
    expect(result.latitude).toBeNull();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ event: "property_location_cleared" }) }));
  });
});

describe("captureFieldLocation (A7)", () => {
  const coords = { latitude: 28.612, longitude: 77.229, accuracy: 12.5 };

  it("an ASSIGNED FIELD_EXECUTIVE can capture", async () => {
    fieldExecutiveHasPropertyAccess.mockResolvedValue(true);
    propertyFindFirst.mockResolvedValue(baseProperty());
    propertyUpdate.mockResolvedValue({ id: "prop1", latitude: coords.latitude, longitude: coords.longitude, locationPrecision: "EXACT", locationAccuracy: coords.accuracy });

    const result = await captureFieldLocation({ propertyId: "prop1", actorId: "fe1", organizationId: "org_default", role: "FIELD_EXECUTIVE", ...coords });

    expect(result.locationPrecision).toBe("EXACT");
    expect(propertyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          latitude: coords.latitude,
          longitude: coords.longitude,
          locationPrecision: "EXACT",
          locationAccuracy: coords.accuracy,
          locationCapturedById: "fe1",
        }),
      })
    );
    expect(propertyUpdate.mock.calls[0][0].data.locationCapturedAt).toBeInstanceOf(Date);
  });

  it("an UNASSIGNED FIELD_EXECUTIVE is denied with 403, before any write", async () => {
    fieldExecutiveHasPropertyAccess.mockResolvedValue(false);
    await expect(captureFieldLocation({ propertyId: "prop1", actorId: "fe1", organizationId: "org_default", role: "FIELD_EXECUTIVE", ...coords })).rejects.toThrow(ApiError);
    expect(propertyUpdate).not.toHaveBeenCalled();
  });

  it("ADMIN can capture without an assigned-visit check", async () => {
    propertyFindFirst.mockResolvedValue(baseProperty());
    propertyUpdate.mockResolvedValue({ id: "prop1" });
    await captureFieldLocation({ propertyId: "prop1", actorId: "admin1", organizationId: "org_default", role: "ADMIN", ...coords });
    expect(fieldExecutiveHasPropertyAccess).not.toHaveBeenCalled();
    expect(propertyUpdate).toHaveBeenCalled();
  });

  it("DATA_MANAGER can capture without an assigned-visit check", async () => {
    propertyFindFirst.mockResolvedValue(baseProperty());
    propertyUpdate.mockResolvedValue({ id: "prop1" });
    await captureFieldLocation({ propertyId: "prop1", actorId: "dm1", organizationId: "org_default", role: "DATA_MANAGER", ...coords });
    expect(fieldExecutiveHasPropertyAccess).not.toHaveBeenCalled();
    expect(propertyUpdate).toHaveBeenCalled();
  });

  it("rejects invalid coordinates without writing", async () => {
    await expect(captureFieldLocation({ propertyId: "prop1", actorId: "admin1", organizationId: "org_default", role: "ADMIN", latitude: 999, longitude: 999 })).rejects.toThrow(ApiError);
    expect(propertyUpdate).not.toHaveBeenCalled();
  });

  it("never changes publicLocationMode - an internal capture must not widen public exposure", async () => {
    fieldExecutiveHasPropertyAccess.mockResolvedValue(true);
    propertyFindFirst.mockResolvedValue(baseProperty({ publicLocationMode: "LOCALITY_ONLY" }));
    propertyUpdate.mockResolvedValue({ id: "prop1" });
    await captureFieldLocation({ propertyId: "prop1", actorId: "fe1", organizationId: "org_default", role: "FIELD_EXECUTIVE", ...coords });
    expect(propertyUpdate.mock.calls[0][0].data).not.toHaveProperty("publicLocationMode");
  });

  it("scopes the assigned-access check to the acting organization", async () => {
    fieldExecutiveHasPropertyAccess.mockResolvedValue(true);
    propertyFindFirst.mockResolvedValue(baseProperty());
    propertyUpdate.mockResolvedValue({ id: "prop1" });
    await captureFieldLocation({ propertyId: "prop1", actorId: "fe1", organizationId: "org_other", role: "FIELD_EXECUTIVE", ...coords });
    expect(fieldExecutiveHasPropertyAccess).toHaveBeenCalledWith("prop1", "fe1", "org_other");
  });

  it("audits the capture with actor and accuracy", async () => {
    fieldExecutiveHasPropertyAccess.mockResolvedValue(true);
    propertyFindFirst.mockResolvedValue(baseProperty());
    propertyUpdate.mockResolvedValue({ id: "prop1" });
    await captureFieldLocation({ propertyId: "prop1", actorId: "fe1", organizationId: "org_default", role: "FIELD_EXECUTIVE", ...coords });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: "fe1", newValues: expect.objectContaining({ event: "property_location_captured_on_site", accuracyMeters: coords.accuracy }) }));
  });
});
