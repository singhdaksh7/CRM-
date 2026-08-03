import { prisma } from "./prisma";
import { getDistanceMatrixCached } from "./geocoding";
import { getMapsProvider } from "@/integrations/maps";
import { haversineDistanceMeters, type Coordinates } from "./geo";
import { logger } from "./logger";

export interface RouteStop {
  visitId: string;
  clientName: string;
  propertyTitle: string;
  visitTime: string;
  coordinates: Coordinates | null;
  /** Travel time/distance FROM the previous stop TO this one - null for the first stop, or when either endpoint has no coordinate. */
  travelFromPreviousMinutes: number | null;
  travelFromPreviousMeters: number | null;
  travelSource: "GOOGLE" | "ESTIMATED" | "NONE";
}

export interface SuggestedRoute {
  stops: RouteStop[];
  unmappedCount: number;
  /** Google Maps multi-stop directions URL for every mapped stop, in schedule order - works with zero API key. Null if fewer than 2 mapped stops exist. */
  fullRouteUrl: string | null;
}

/**
 * Builds a "suggested route" for one employee's remaining visits on a given
 * day - this is deliberately NOT a route optimizer. Visit times are set
 * explicitly by the dispatcher (there is no "flexible time window" concept
 * in this data model yet), so stops are always shown in their already
 * scheduled chronological order; the only thing computed here is the real
 * (or estimated) travel time between consecutive stops, exactly the same
 * inputs visit-conflict.ts uses for conflict detection. Never silently
 * reorders or reschedules anything.
 */
export async function buildSuggestedRoute(params: { employeeId: string; organizationId: string; date: Date }): Promise<SuggestedRoute> {
  const dayStart = new Date(params.date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(params.date);
  dayEnd.setHours(23, 59, 59, 999);

  const visits = await prisma.visit.findMany({
    where: {
      organizationId: params.organizationId,
      assignedToId: params.employeeId,
      visitDate: { gte: dayStart, lte: dayEnd },
      status: { in: ["SCHEDULED", "CONFIRMED", "CLIENT_REACHED", "EMPLOYEE_REACHED"] },
    },
    include: { lead: { select: { clientName: true } }, property: { select: { title: true, latitude: true, longitude: true } } },
    orderBy: { visitTime: "asc" },
  });

  const stops: RouteStop[] = [];
  let previousCoordinates: Coordinates | null = null;
  let unmappedCount = 0;

  for (const visit of visits) {
    const coordinates: Coordinates | null = visit.property.latitude !== null && visit.property.longitude !== null ? { latitude: visit.property.latitude, longitude: visit.property.longitude } : null;
    if (!coordinates) unmappedCount++;

    let travelFromPreviousMinutes: number | null = null;
    let travelFromPreviousMeters: number | null = null;
    let travelSource: RouteStop["travelSource"] = "NONE";

    if (previousCoordinates && coordinates) {
      if (getMapsProvider().name === "DISABLED") {
        travelFromPreviousMeters = Math.round(haversineDistanceMeters(previousCoordinates, coordinates));
        travelFromPreviousMinutes = null; // no speed assumption without a real routing engine - distance only
        travelSource = "ESTIMATED";
      } else {
        try {
          const matrix = await getDistanceMatrixCached([previousCoordinates], [coordinates]);
          const element = matrix.rows[0]?.[0];
          if (element?.status === "OK") {
            travelFromPreviousMinutes = element.durationSeconds !== null ? Math.ceil(element.durationSeconds / 60) : null;
            travelFromPreviousMeters = element.distanceMeters;
            travelSource = "GOOGLE";
          }
        } catch (err) {
          logger.warn("route_suggestion_distance_matrix_failed", { message: err instanceof Error ? err.message : String(err) });
          travelFromPreviousMeters = Math.round(haversineDistanceMeters(previousCoordinates, coordinates));
          travelSource = "ESTIMATED";
        }
      }
    }

    stops.push({
      visitId: visit.id,
      clientName: visit.lead.clientName,
      propertyTitle: visit.property.title,
      visitTime: visit.visitTime,
      coordinates,
      travelFromPreviousMinutes,
      travelFromPreviousMeters,
      travelSource,
    });

    if (coordinates) previousCoordinates = coordinates;
  }

  const mapped = stops.filter((s) => s.coordinates);
  let fullRouteUrl: string | null = null;
  if (mapped.length >= 2) {
    const url = new URL("https://www.google.com/maps/dir/?api=1");
    const [origin, ...rest] = mapped;
    const destination = rest[rest.length - 1];
    const waypoints = rest.slice(0, -1);
    url.searchParams.set("origin", `${origin.coordinates!.latitude},${origin.coordinates!.longitude}`);
    url.searchParams.set("destination", `${destination.coordinates!.latitude},${destination.coordinates!.longitude}`);
    if (waypoints.length > 0) url.searchParams.set("waypoints", waypoints.map((w) => `${w.coordinates!.latitude},${w.coordinates!.longitude}`).join("|"));
    fullRouteUrl = url.toString();
  }

  return { stops, unmappedCount, fullRouteUrl };
}
