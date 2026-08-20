import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { matchPropertiesToLead, sectionizeMatches } from "@/lib/matching";
import { getOrganizationId } from "@/lib/organization";
import { getLocalityCentroid } from "@/lib/locality";
import { haversineDistanceMeters } from "@/lib/geo";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!lead) throw new ApiError(404, "Lead not found");
    if (session.user.role === "FIELD_EXECUTIVE" && lead.assignedToId !== session.user.id) {
      throw new ApiError(403, "Forbidden");
    }

    const tolerance = Number(req.nextUrl.searchParams.get("tolerance") ?? "0.2");
    // Optional additional widening beyond the matching engine's own
    // built-in curated/derived ~3km nearby-locality set (see
    // src/lib/locality.ts#getNearbyLocalities). Expressed in meters so the
    // UI's "Exact only / +3km / +5km / +10km" selector maps directly.
    const radiusParam = req.nextUrl.searchParams.get("radius");
    const radiusMeters = radiusParam ? Number(radiusParam) : 0;

    const properties = await prisma.property.findMany({
      where: { status: "AVAILABLE", organizationId },
      include: { owner: { select: { verificationStatus: true } } },
    });

    let matches = matchPropertiesToLead(properties, lead, tolerance);

    if (radiusMeters > 0) {
      const leadCentroid = getLocalityCentroid(lead.preferredLocation);
      if (leadCentroid) {
        matches = matches.map((m) => {
          // Only touched when the base engine didn't already establish an
          // exact or curated-nearby location match - never downgrades a
          // result, purely additive widening.
          if (m.locationMatchKind !== "none") return m;
          const propertyCoords =
            m.property.latitude !== null && m.property.longitude !== null
              ? { latitude: m.property.latitude, longitude: m.property.longitude }
              : getLocalityCentroid(m.property.area);
          if (!propertyCoords) return m;
          const distanceMeters = haversineDistanceMeters(leadCentroid, propertyCoords);
          if (distanceMeters > radiusMeters) return m;
          return {
            ...m,
            locationMatchKind: "nearby" as const,
            reasons: [
              ...m.reasons.filter((r) => r.label !== "Location"),
              { label: "Location", matched: true, detail: `Within ${(distanceMeters / 1000).toFixed(1)}km of preferred locality "${lead.preferredLocation}"` },
            ],
          };
        });
      }
    }

    const sections = sectionizeMatches(matches);
    return NextResponse.json({ matches, sections });
  } catch (err) {
    return handleApiError(err);
  }
}
