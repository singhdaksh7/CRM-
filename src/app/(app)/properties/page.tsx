import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PropertyFilters } from "@/components/properties/property-filters";
import { PropertiesTable } from "@/components/properties/properties-table";
import { SavedViewsBar } from "@/components/saved-views/saved-views-bar";
import { PropertyCard } from "@/components/properties/property-card";
import { EmptyState } from "@/components/ui/states";
import { LinkButton } from "@/components/ui/button";
import { withTiming } from "@/lib/perf";
import { getOrganizationId } from "@/lib/organization";
import {
  PROPERTY_LIST_INITIAL_TAKE,
  PROPERTY_LIST_SORT_TIMESTAMP,
  listAvailablePropertiesPage,
} from "@/lib/property-list-query";
import { Plus, Upload, History } from "lucide-react";
import Link from "next/link";
import type { Prisma, PropertyStatus } from "@prisma/client";

/**
 * Operational property inventory.
 * Default: latest 10 AVAILABLE properties for the current organization,
 * newest-first by Property.createdAt (no separate listedAt column exists).
 * See More uses real server cursor pagination via `cursor` query param.
 */
export default async function PropertiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const organizationId = getOrganizationId(session!.user);
  const sp = await searchParams;
  const view = sp.view === "table" ? "table" : "card";
  const canCreate = session?.user?.role === "ADMIN" || session?.user?.role === "DATA_MANAGER";

  // Explicit status in the URL wins. Missing status → AVAILABLE (operational default).
  // status=ALL → no status predicate (full inventory).
  const statusFilter: PropertyStatus | null =
    sp.status === "ALL" ? null : ((sp.status as PropertyStatus | undefined) ?? "AVAILABLE");
  const hasCustomFilters = Boolean(sp.q || sp.listingType || sp.assetClass || sp.area || sp.bhk || sp.furnishing || (sp.status && sp.status !== "AVAILABLE") || sp.sort);

  const listResult = await withTiming("propertiesPageQuery", "/properties", () =>
    listAvailablePropertiesPage({
      organizationId,
      take: PROPERTY_LIST_INITIAL_TAKE,
      cursor: sp.cursor,
      status: statusFilter === null ? null : statusFilter,
      q: sp.q,
      listingType: sp.listingType,
      assetClass: sp.assetClass,
      area: sp.area,
      bhk: sp.bhk ? Number(sp.bhk) : null,
      furnishing: sp.furnishing,
    })
  );

  const { properties, coverImageUrls, nextCursor, listedTimestampField } = listResult;

  // Table view still needs a count for the header when filters are applied.
  const where: Prisma.PropertyWhereInput = {
    organizationId,
    ...(statusFilter ? { status: statusFilter } : {}),
  };
  if (sp.q) {
    where.OR = [
      { title: { contains: sp.q } },
      { area: { contains: sp.q } },
      { address: { contains: sp.q } },
      { propertyCode: { contains: sp.q } },
    ];
  }
  if (sp.listingType) where.listingType = sp.listingType as never;
  if (sp.assetClass) where.assetClass = sp.assetClass as never;
  if (sp.area) where.area = sp.area;
  if (sp.bhk) where.bhk = Number(sp.bhk);
  if (sp.furnishing) where.furnishing = sp.furnishing as never;

  const totalCount = await prisma.property.count({ where });

  const seeMoreParams = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === "cursor" || value === undefined) continue;
    seeMoreParams.set(key, value);
  }
  if (!sp.status) seeMoreParams.set("status", "AVAILABLE");
  if (nextCursor) seeMoreParams.set("cursor", nextCursor);
  const seeMoreHref = nextCursor ? `/properties?${seeMoreParams.toString()}` : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E7ECF2] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">Property Inventory</h1>
          <p className="mt-1 text-sm text-[#596579]">
            {totalCount} {statusFilter === "AVAILABLE" && !hasCustomFilters ? "available" : "matching"} listings
            {" · "}sorted by {listedTimestampField === PROPERTY_LIST_SORT_TIMESTAMP ? "listed date (createdAt)" : listedTimestampField}
          </p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/properties/import/history" variant="secondary">
              <History className="h-4 w-4" /> Import history
            </LinkButton>
            <LinkButton href="/properties/import" variant="secondary">
              <Upload className="h-4 w-4" /> Import Excel/CSV
            </LinkButton>
            <LinkButton href="/properties/new">
              <Plus className="h-4 w-4" /> Add Property
            </LinkButton>
          </div>
        )}
      </div>

      <PropertyFilters view={view} />
      <SavedViewsBar entityType="PROPERTY" />

      {properties.length === 0 ? (
        <EmptyState title="No matching properties" description="Try adjusting your filters or search query to find inventory." />
      ) : view === "card" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p as never} coverImageUrl={coverImageUrls[p.id]} listedAt={p.createdAt} />
          ))}
        </div>
      ) : (
        <PropertiesTable properties={properties as never} canManage={canCreate} />
      )}

      {seeMoreHref && (
        <div className="flex justify-center pt-2">
          <Link
            href={seeMoreHref}
            className="inline-flex items-center rounded-xl border border-[#E7ECF2] bg-white px-4 py-2 text-sm font-semibold text-[#1B2430] shadow-xs hover:bg-[#F3F6FA]"
          >
            See More
          </Link>
        </div>
      )}
    </div>
  );
}
