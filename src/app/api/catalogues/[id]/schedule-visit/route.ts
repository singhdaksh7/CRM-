import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { catalogueScheduleVisitSchema } from "@/lib/validators";
import { scheduleVisitFromCatalogue } from "@/lib/visits";

/**
 * Schedules a real Visit from a catalogue.
 *
 * This is the route that closes the original bug. Before it existed, the
 * only catalogue "visit" path was the public VISIT_REQUESTED interaction,
 * which recorded a CatalogueInteraction and a FollowUp but never created a
 * Visit row - so a visit "scheduled from a catalogue" could not possibly
 * appear in Admin Upcoming Visits or in the assigned executive's list,
 * because it did not exist.
 *
 * The properties in `propertyIds` are exactly what lands in the visit; the
 * caller's selection is never silently widened to the whole catalogue.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const input = catalogueScheduleVisitSchema.parse(await req.json());

    const visitDate = new Date(input.visitDate);
    if (Number.isNaN(visitDate.getTime())) throw new ApiError(400, "Invalid visit date");

    const visit = await scheduleVisitFromCatalogue({
      catalogueShareId: id,
      organizationId: getOrganizationId(session.user.id),
      propertyIds: input.propertyIds,
      assignedToId: input.assignedToId,
      visitDate,
      visitTime: input.visitTime,
      meetingLocation: input.meetingLocation,
      createdById: session.user.id,
    });

    return NextResponse.json({ visit }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
