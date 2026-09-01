import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { recordAudit } from "./audit";
import { logger } from "./logger";
import { geocodeAddressCached } from "./geocoding";
import { MapsConfigError, MapsProviderError } from "@/integrations/maps";
import { isValidCoordinates, isPlausibleDelhiNcrCoordinates } from "./geo";
import { fieldExecutiveHasPropertyAccess } from "./property-access";
import type { Role, LocationPrecision } from "@prisma/client";

function assertCanEditLocation(role: Role) {
  if (role !== "ADMIN" && role !== "DATA_MANAGER") {
    throw new ApiError(403, "You do not have permission to edit a property's location");
  }
}

async function loadProperty(propertyId: string, organizationId: string) {
  const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId } });
  if (!property) throw new ApiError(404, "Property not found");
  return property;
}

/**
 * Geocodes a property's existing address fields (address, area, city) and
 * saves the result - never runs automatically; always triggered by an
 * explicit user action (initial address search selection, or "Re-geocode"
 * on the property detail map panel). Does not overwrite the user-entered
 * `address`/`area`/`landmark` fields - only the geocode-derived metadata.
 */
export async function geocodeProperty(params: { propertyId: string; actorId: string; organizationId: string; role: Role }) {
  assertCanEditLocation(params.role);
  const organizationId = params.organizationId;
  const property = await loadProperty(params.propertyId, organizationId);

  const query = [property.address, property.area, property.city, "India"].filter(Boolean).join(", ");

  try {
    const results = await geocodeAddressCached(query);
    if (results.length === 0) {
      await prisma.property.update({ where: { id: property.id }, data: { geocodeStatus: "FAILED" } });
      throw new ApiError(400, "No matching location found for this address - try adding more detail (landmark, pincode) or set the location manually.");
    }

    const best = results[0];
    const updated = await prisma.property.update({
      where: { id: property.id },
      data: {
        latitude: best.location.latitude,
        longitude: best.location.longitude,
        formattedAddress: best.formattedAddress,
        placeId: best.placeId,
        geocodeStatus: "SUCCESS",
        geocodedAt: new Date(),
        locationPrecision: best.isPreciseMatch ? "EXACT" : "APPROXIMATE",
      },
    });

    await recordAudit({
      userId: params.actorId,
      action: "UPDATE",
      entityType: "Property",
      entityId: property.id,
      // Never log the full address - only the safe, already-public-ish bits.
      newValues: { event: "property_geocoded", area: property.area, city: property.city, precision: updated.locationPrecision },
    });
    logger.info("property_geocoded", { propertyId: property.id, actorId: params.actorId, precision: updated.locationPrecision });

    return updated;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    await prisma.property.update({ where: { id: property.id }, data: { geocodeStatus: "FAILED" } });
    if (err instanceof MapsConfigError) throw new ApiError(503, "Maps integration is not configured - set MAPS_PROVIDER=GOOGLE to enable address geocoding.");
    if (err instanceof MapsProviderError) throw new ApiError(502, "Could not reach the maps provider - please try again shortly.");
    throw err;
  }
}

/** Manually sets (or corrects) a property's coordinates - e.g. dragging a pin, or entering coordinates directly. Marked MANUAL/geocodeStatus so it's clear this was never verified by the maps provider. */
export async function setManualPropertyLocation(params: { propertyId: string; actorId: string; organizationId: string; role: Role; latitude: number; longitude: number }) {
  assertCanEditLocation(params.role);
  if (!isValidCoordinates({ latitude: params.latitude, longitude: params.longitude })) {
    throw new ApiError(400, "Invalid coordinates");
  }
  const organizationId = params.organizationId;
  const property = await loadProperty(params.propertyId, organizationId);

  const plausible = isPlausibleDelhiNcrCoordinates({ latitude: params.latitude, longitude: params.longitude });

  const updated = await prisma.property.update({
    where: { id: property.id },
    data: {
      latitude: params.latitude,
      longitude: params.longitude,
      geocodeStatus: "MANUAL",
      geocodedAt: new Date(),
      locationPrecision: "EXACT",
    },
  });

  await recordAudit({
    userId: params.actorId,
    action: "UPDATE",
    entityType: "Property",
    entityId: property.id,
    newValues: { event: "property_coordinates_changed", source: "manual", plausibleForDelhiNcr: plausible },
  });
  logger.info("property_coordinates_changed", { propertyId: property.id, actorId: params.actorId, source: "manual" });

  return updated;
}

/** Marks the current coordinates as approximate rather than exact - e.g. an Admin reviewing a geocode result that landed on the wrong building. */
export async function markPropertyLocationApproximate(params: { propertyId: string; actorId: string; organizationId: string; role: Role }) {
  assertCanEditLocation(params.role);
  const organizationId = params.organizationId;
  const property = await loadProperty(params.propertyId, organizationId);

  const updated = await prisma.property.update({ where: { id: property.id }, data: { locationPrecision: "APPROXIMATE" } });
  await recordAudit({
    userId: params.actorId,
    action: "UPDATE",
    entityType: "Property",
    entityId: property.id,
    newValues: { event: "property_location_marked_approximate" },
  });
  return updated;
}

/** Controls what the public catalogue is allowed to reveal for this property - independent of how precise the stored coordinate actually is. Defaults to LOCALITY_ONLY; this is the only place that can widen or narrow that. */
export async function setPublicLocationMode(params: { propertyId: string; actorId: string; organizationId: string; role: Role; mode: LocationPrecision }) {
  assertCanEditLocation(params.role);
  const organizationId = params.organizationId;
  const property = await loadProperty(params.propertyId, organizationId);

  const updated = await prisma.property.update({ where: { id: property.id }, data: { publicLocationMode: params.mode } });
  await recordAudit({
    userId: params.actorId,
    action: "UPDATE",
    entityType: "Property",
    entityId: property.id,
    oldValues: { publicLocationMode: property.publicLocationMode },
    newValues: { event: params.mode === "HIDDEN" || params.mode === "LOCALITY_ONLY" ? "exact_location_hidden" : "public_location_mode_changed", publicLocationMode: params.mode },
  });
  logger.info("property_public_location_mode_changed", { propertyId: property.id, actorId: params.actorId, mode: params.mode });

  return updated;
}

/**
 * A7 - explicit, human-triggered on-site GPS capture. Called only from a
 * field executive tapping "Capture Location" while physically at an
 * assigned property (or by ADMIN/DATA_MANAGER, who retain the same
 * management access they have everywhere else in the location workflow).
 * Never called automatically, on page load, or as a background/continuous
 * process - see the capture-location API route, which requires an explicit
 * request body coordinate the browser only produces from
 * navigator.geolocation.getCurrentPosition() in response to a button press.
 *
 * Reuses the existing latitude/longitude columns (no duplicate coordinate
 * pair) and marks locationPrecision EXACT - a device GPS fix is inherently
 * more precise than a desk-entered pin. Deliberately does NOT touch
 * publicLocationMode: capturing an exact internal coordinate must never by
 * itself widen what the public catalogue/property page is allowed to
 * reveal (still defaults to LOCALITY_ONLY unless an ADMIN/DATA_MANAGER
 * explicitly changes it via setPublicLocationMode).
 */
export async function captureFieldLocation(params: { propertyId: string; actorId: string; organizationId: string; role: Role; latitude: number; longitude: number; accuracy?: number | null }) {
  if (params.role === "FIELD_EXECUTIVE") {
    const hasAccess = await fieldExecutiveHasPropertyAccess(params.propertyId, params.actorId, params.organizationId);
    if (!hasAccess) throw new ApiError(403, "You don't have an assigned visit or lead catalogue involving this property");
  } else if (params.role !== "ADMIN" && params.role !== "DATA_MANAGER") {
    throw new ApiError(403, "You do not have permission to capture this property's location");
  }
  if (!isValidCoordinates({ latitude: params.latitude, longitude: params.longitude })) {
    throw new ApiError(400, "Invalid coordinates");
  }
  const property = await loadProperty(params.propertyId, params.organizationId);

  const updated = await prisma.property.update({
    where: { id: property.id },
    data: {
      latitude: params.latitude,
      longitude: params.longitude,
      locationPrecision: "EXACT",
      locationAccuracy: params.accuracy ?? null,
      locationCapturedAt: new Date(),
      locationCapturedById: params.actorId,
    },
  });

  await recordAudit({
    userId: params.actorId,
    action: "UPDATE",
    entityType: "Property",
    entityId: property.id,
    newValues: { event: "property_location_captured_on_site", accuracyMeters: params.accuracy ?? null },
  });
  logger.info("property_location_captured_on_site", { propertyId: property.id, actorId: params.actorId, role: params.role, accuracyMeters: params.accuracy ?? null });

  return updated;
}

/** Clears any stored coordinate/geocode metadata - used by "Clear location" in the property form. Manual address fields (address/area/city/landmark) are untouched. */
export async function clearPropertyLocation(params: { propertyId: string; actorId: string; organizationId: string; role: Role }) {
  assertCanEditLocation(params.role);
  const organizationId = params.organizationId;
  const property = await loadProperty(params.propertyId, organizationId);

  const updated = await prisma.property.update({
    where: { id: property.id },
    data: { latitude: null, longitude: null, formattedAddress: null, placeId: null, geocodeStatus: "NOT_ATTEMPTED", geocodedAt: null, locationPrecision: "APPROXIMATE" },
  });
  await recordAudit({ userId: params.actorId, action: "UPDATE", entityType: "Property", entityId: property.id, newValues: { event: "property_location_cleared" } });
  return updated;
}
