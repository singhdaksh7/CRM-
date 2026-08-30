import { prisma } from "./prisma";

/**
 * A field executive has a legitimate reason to see a property's internal
 * detail (exact address, entry instructions, owner/partner contact, GPS)
 * only when they have an assigned visit that includes it, or it appears in
 * a catalogue built for one of their own assigned leads.
 *
 * Checks BOTH the legacy `Visit.propertyId` (first property) and the
 * authoritative `VisitProperty` join (full multi-property set) - a
 * property that is the 2nd/3rd stop on a multi-property visit must grant
 * access exactly like the primary one does (see visit-detail-dto.ts /
 * visits.ts, which already treat VisitProperty as authoritative).
 */
export async function fieldExecutiveHasPropertyAccess(propertyId: string, userId: string, organizationId: string): Promise<boolean> {
  const [visit, catalogueMatch] = await Promise.all([
    prisma.visit.findFirst({
      where: {
        organizationId,
        assignedToId: userId,
        OR: [{ propertyId }, { properties: { some: { propertyId } } }],
      },
      select: { id: true },
    }),
    prisma.catalogueShareProperty.findFirst({
      where: { propertyId, catalogueShare: { organizationId, lead: { assignedToId: userId } } },
      select: { id: true },
    }),
  ]);
  return Boolean(visit || catalogueMatch);
}
