import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { ConflictList, type ConflictListing } from "@/components/property-portals/conflict-list";

export default async function PortalSyncConflictsPage() {
  const session = await auth();
  if (!session || session.user.role === "FIELD_EXECUTIVE") return null;
  const organizationId = getOrganizationId(session.user.id);

  const listings = await prisma.portalListing.findMany({
    where: { organizationId, status: "SYNC_CONFLICT" },
    include: { property: { select: { id: true, title: true, propertyCode: true, monthlyRent: true, salePrice: true, status: true, availableFrom: true, description: true, area: true } } },
    orderBy: { conflictDetectedAt: "desc" },
  });

  const conflicts: ConflictListing[] = listings.map((listing) => {
    let fields: string[] = [];
    try { fields = listing.conflictFields ? JSON.parse(listing.conflictFields) : []; } catch { fields = []; }
    let portalSnapshot: Record<string, unknown> = {};
    try { portalSnapshot = listing.portalSnapshot ? JSON.parse(listing.portalSnapshot) : {}; } catch { portalSnapshot = {}; }
    const crmSnapshot: Record<string, unknown> = {
      monthlyRent: listing.property.monthlyRent,
      salePrice: listing.property.salePrice,
      status: listing.property.status,
      availableFrom: listing.property.availableFrom?.toISOString() ?? null,
      title: listing.property.title,
      description: listing.property.description,
      locality: listing.property.area,
    };
    return {
      id: listing.id,
      provider: listing.provider,
      propertyId: listing.property.id,
      propertyTitle: listing.property.title,
      propertyCode: listing.property.propertyCode,
      conflictFields: fields,
      crmSnapshot,
      portalSnapshot,
      conflictDetectedAt: listing.conflictDetectedAt?.toISOString() ?? null,
      conflictResolution: listing.conflictResolution,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1B2430]">Portal Sync Conflicts</h1>
        <p className="mt-1 text-sm text-[#596579]">Listings where a provider snapshot differs from CRM state on price, availability, or metadata. Resolutions are recorded for human follow-up; nothing is applied automatically.</p>
      </div>
      <ConflictList conflicts={conflicts} canResolve={["ADMIN", "DATA_MANAGER"].includes(session.user.role)} />
    </div>
  );
}
