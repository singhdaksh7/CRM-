import { prisma } from "./prisma";
import { getDirectionsCached } from "./geocoding";
import { getMapsProvider } from "@/integrations/maps";
import { haversineDistanceMeters, type Coordinates } from "./geo";
import { logger } from "./logger";
import type { RouteSource } from "@prisma/client";

/** Assumed time a Field Executive spends at a property visit - used only to compute the gap between two back-to-back visits, since Visit has no explicit duration field. Documented as an assumption, not a measurement. */
export const DEFAULT_VISIT_DURATION_MINUTES = 45;
/** Minimum buffer required between the end of one visit and the start of the next, on top of travel time. */
export const DEFAULT_CONFLICT_BUFFER_MINUTES = 15;
/** Used only when Maps is disabled or the API call fails - a clearly-labelled estimate, never presented as a measured travel time. */
export const FALLBACK_TRAVEL_ESTIMATE_MINUTES = 30;

export interface VisitConflictInput {
  /** Excluded from its own neighbor search when updating an existing visit. */
  visitId?: string;
  employeeId: string;
  organizationId: string;
  visitDate: Date;
  visitTime: string; // "HH:MM"
  propertyId: string;
}

export interface VisitConflictResult {
  status: "NONE" | "WARNING";
  detail: string | null;
  travelDurationMinutes: number | null;
  travelDistanceMeters: number | null;
  routeSource: RouteSource;
}

function parseVisitDateTime(visitDate: Date, visitTime: string): Date {
  const [hours, minutes] = visitTime.split(":").map(Number);
  const dt = new Date(visitDate);
  dt.setHours(hours || 0, minutes || 0, 0, 0);
  return dt;
}

interface Neighbor {
  id: string;
  dateTime: Date;
  coordinates: Coordinates | null;
}

/** Real travel time between two coordinates when Maps is enabled and reachable; otherwise a clearly-labelled fixed estimate. Never throws - a Maps failure degrades to the estimate rather than blocking scheduling. */
async function estimateTravelMinutes(a: Coordinates, b: Coordinates): Promise<{ minutes: number; distanceMeters: number | null; source: RouteSource }> {
  if (getMapsProvider().name === "DISABLED") {
    return { minutes: FALLBACK_TRAVEL_ESTIMATE_MINUTES, distanceMeters: Math.round(haversineDistanceMeters(a, b)), source: "ESTIMATED" };
  }
  try {
    const directions = await getDirectionsCached(a, b);
    return { minutes: Math.ceil((directions.durationInTrafficSeconds ?? directions.durationSeconds) / 60), distanceMeters: directions.distanceMeters, source: "GOOGLE" };
  } catch (err) {
    logger.warn("visit_conflict_directions_failed", { message: err instanceof Error ? err.message : String(err) });
    return { minutes: FALLBACK_TRAVEL_ESTIMATE_MINUTES, distanceMeters: Math.round(haversineDistanceMeters(a, b)), source: "ESTIMATED" };
  }
}

/**
 * Checks whether scheduling/updating a visit creates a route-aware
 * conflict with the same employee's immediately-previous and
 * immediately-next visit that day. A same-property back-to-back visit
 * never conflicts (no travel required). When Maps is disabled, falls back
 * to a clearly-labelled fixed-buffer estimate rather than blocking
 * scheduling on a guess presented as a measurement.
 */
export async function checkVisitConflict(input: VisitConflictInput): Promise<VisitConflictResult> {
  const thisDateTime = parseVisitDateTime(input.visitDate, input.visitTime);
  const dayStart = new Date(input.visitDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(input.visitDate);
  dayEnd.setHours(23, 59, 59, 999);

  const sameDayVisits = await prisma.visit.findMany({
    where: {
      organizationId: input.organizationId,
      assignedToId: input.employeeId,
      visitDate: { gte: dayStart, lte: dayEnd },
      status: { in: ["SCHEDULED", "CONFIRMED", "CLIENT_REACHED", "EMPLOYEE_REACHED"] },
      ...(input.visitId ? { id: { not: input.visitId } } : {}),
    },
    include: { property: { select: { id: true, latitude: true, longitude: true } } },
  });

  const neighbors: Neighbor[] = sameDayVisits.map((v) => ({
    id: v.id,
    dateTime: parseVisitDateTime(v.visitDate, v.visitTime),
    coordinates: v.property.latitude !== null && v.property.longitude !== null ? { latitude: v.property.latitude, longitude: v.property.longitude } : null,
  }));

  const before = neighbors.filter((n) => n.dateTime < thisDateTime).sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime())[0];
  const after = neighbors.filter((n) => n.dateTime > thisDateTime).sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())[0];

  const thisProperty = await prisma.property.findUnique({ where: { id: input.propertyId }, select: { latitude: true, longitude: true } });
  const thisCoordinates: Coordinates | null = thisProperty?.latitude !== null && thisProperty?.longitude !== null && thisProperty ? { latitude: thisProperty.latitude, longitude: thisProperty.longitude } : null;

  // A literal time double-booking (identical slot) is always a conflict, Maps or not.
  const exactOverlap = neighbors.some((n) => n.dateTime.getTime() === thisDateTime.getTime());
  if (exactOverlap) {
    return { status: "WARNING", detail: "Another visit is already scheduled for this employee at the exact same time.", travelDurationMinutes: null, travelDistanceMeters: null, routeSource: "NONE" };
  }

  let worst: VisitConflictResult = { status: "NONE", detail: null, travelDurationMinutes: null, travelDistanceMeters: null, routeSource: "NONE" };

  for (const [neighbor, direction] of [[before, "before"] as const, [after, "after"] as const]) {
    if (!neighbor) continue;
    if (!thisCoordinates || !neighbor.coordinates) continue; // can't estimate travel without both coordinates - not treated as a conflict

    const gapMinutes = Math.abs(thisDateTime.getTime() - neighbor.dateTime.getTime()) / 60_000 - DEFAULT_VISIT_DURATION_MINUTES;
    if (gapMinutes < 0) continue; // already caught by scheduling overlap logic elsewhere; avoid a negative-gap false positive here

    const { minutes: travelMinutes, distanceMeters, source } = await estimateTravelMinutes(thisCoordinates, neighbor.coordinates);
    const required = travelMinutes + DEFAULT_CONFLICT_BUFFER_MINUTES;

    if (gapMinutes < required) {
      const label = source === "ESTIMATED" ? "estimated" : "measured";
      const detail = `Only ${Math.round(gapMinutes)} min available ${direction} this visit, but ~${travelMinutes} min travel (${label}) + ${DEFAULT_CONFLICT_BUFFER_MINUTES} min buffer is needed.`;
      worst = { status: "WARNING", detail, travelDurationMinutes: travelMinutes, travelDistanceMeters: distanceMeters, routeSource: source };
      break; // report the first conflict found; both directions rarely matter for the same override decision
    }
  }

  return worst;
}
