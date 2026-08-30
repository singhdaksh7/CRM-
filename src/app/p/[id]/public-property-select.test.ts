import { describe, it, expect } from "vitest";
import { PUBLIC_PROPERTY_SELECT } from "@/lib/public-property-select";

/**
 * A2 - the public /p/[id] property page must be safe at the DATA
 * boundary, not by "we simply don't render the field" JSX discipline.
 * This asserts the exact Prisma `select` allow-list the query uses,
 * independent of any component rendering, so a future edit that adds a
 * sensitive field back into scope fails a test immediately rather than
 * relying on someone noticing it's unused in JSX.
 */

const FORBIDDEN_FIELDS = [
  "internalNotes",
  "negotiationNotes",
  "hiddenRemarks",
  "ownerName",
  "ownerPhone",
  "ownerAlternatePhone",
  "ownerNotes",
  "entryInstructions",
  "gateNumber",
  "buildingName",
  "flatNumber",
  "address",
  "landmark",
  "latitude",
  "longitude",
  "locationPrecision",
  "publicLocationMode",
  "geocodeStatus",
  "geocodedAt",
  "formattedAddress",
  "placeId",
  "pincode",
  "propertySource",
  "keyAvailability",
  "lastVerifiedAt",
  "lastVerifiedById",
  "locationCapturedAt",
  "locationCapturedById",
  "locationAccuracy",
  "createdById",
  "createdAt",
  "updatedAt",
  "partnerId",
  "ownerId",
  "pendingVerification",
];

describe("PUBLIC_PROPERTY_SELECT - safe at the data boundary (A2)", () => {
  it("never selects any internal/private field", () => {
    for (const field of FORBIDDEN_FIELDS) {
      expect(PUBLIC_PROPERTY_SELECT).not.toHaveProperty(field);
    }
  });

  it("selects only fields explicitly set to true (a strict allow-list, no accidental includes/relations)", () => {
    for (const [key, value] of Object.entries(PUBLIC_PROPERTY_SELECT)) {
      expect(value, `${key} should be selected as a scalar boolean true`).toBe(true);
    }
  });

  it("still selects the fields the public page actually needs to render", () => {
    for (const field of ["id", "organizationId", "propertyCode", "title", "listingType", "area", "bhk", "bathrooms", "builtUpAreaSqft", "amenities", "description", "coverImage"]) {
      expect(PUBLIC_PROPERTY_SELECT).toHaveProperty(field, true);
    }
  });
});
