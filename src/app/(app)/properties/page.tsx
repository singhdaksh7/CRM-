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
import { propertyTypeFilterValues } from "@/lib/property-categories";
import { propertyListBhkWhere, resolvePropertyListBhkFilter } from "@/lib/property-list-filters";
import { Pagination, parsePage, parsePageSize, PROPERTY_PAGE_SIZE_OPTIONS } from "@/components/ui/pagination";
import { Plus, Upload, History } from "lucide-react";
import type { Prisma, PropertyStatus } from "@prisma/client";

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const organizationId = getOrganizationId(session!.user);
  const sp = await searchParams;
  const view = sp.view === "table" ? "table" : "card";
  const canManage = session?.user?.role === "ADMIN" || session?.user?.role === "DATA_MANAGER";
  const canCreate = canManage || session?.user?.role === "FIELD_EXECUTIVE";

  const statusFilter: PropertyStatus | null =
    sp.status === "ALL" ? null : ((sp.status as PropertyStatus | undefined) ?? "AVAILABLE");
  const { bhk, assetClass } = resolvePropertyListBhkFilter({ bhk: sp.bhk, assetClass: sp.assetClass });
  const hasCustomFilters = Boolean(sp.q || sp.listingType || assetClass || sp.propertyType || sp.area || bhk !== null || sp.furnishing || sp.possessionStatus || sp.liftAvailable || sp.parkFacing || (sp.status && sp.status !== "AVAILABLE") || sp.sort);

  const pageSize = parsePageSize(sp.pageSize, PROPERTY_LIST_INITIAL_TAKE, PROPERTY_PAGE_SIZE_OPTIONS);
  let page = parsePage(sp.page);

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
  if (sp.propertyType) where.propertyType = { in: propertyTypeFilterValues(sp.propertyType) as never };
  if (sp.area && sp.area.trim()) {
    where.area = { equals: sp.area.trim(), mode: "insensitive" };
  }
  Object.assign(where, propertyListBhkWhere({ bhk, assetClass }));
  if (sp.furnishing) where.furnishing = sp.furnishing as never;
  if (sp.possessionStatus) where.possessionStatus = sp.possessionStatus as never;
  if (sp.liftAvailable) where.liftAvailable = sp.liftAvailable === "true";
  if (sp.parkFacing) where.parkFacing = sp.parkFacing === "true";

  const totalCount = await prisma.property.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (page > totalPages) {
    page = totalPages;
  }

  const listResult = await withTiming("propertiesPageQuery", "/properties", () =>
    listAvailablePropertiesPage({
      organizationId,
      page,
      pageSize,
      status: statusFilter === null ? null : statusFilter,
      q: sp.q,
      listingType: sp.listingType,
      assetClass,
      propertyType: sp.propertyType,
      area: sp.area,
      bhk,
      furnishing: sp.furnishing,
      possessionStatus: sp.possessionStatus,
      liftAvailable: sp.liftAvailable ? sp.liftAvailable === "true" : null,
      parkFacing: sp.parkFacing ? sp.parkFacing === "true" : null,
    })
  );

  const { properties, coverImageUrls, listedTimestampField } = listResult;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E4E4E7] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#09090B]">Property Inventory</h1>
          <p className="mt-1 text-xs text-[#71717A]">
            {totalCount} {statusFilter === "AVAILABLE" && !hasCustomFilters ? "available" : "matching"} listings
            {" · "}sorted by {listedTimestampField === PROPERTY_LIST_SORT_TIMESTAMP ? "listed date" : listedTimestampField}
          </p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap items-center gap-2">
            {canManage && <>
              <LinkButton href="/properties/import/history" variant="secondary">
                <History className="h-4 w-4" /> Import history
              </LinkButton>
              <LinkButton href="/properties/import" variant="secondary">
                <Upload className="h-4 w-4" /> Import Excel/CSV
              </LinkButton>
            </>}
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
        <PropertiesTable properties={properties as never} canManage={canManage} />
      )}

      <Pagination
        basePath="/properties"
        currentParams={sp}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        showPageNumbers
        pageSizeOptions={PROPERTY_PAGE_SIZE_OPTIONS}
      />
    </div>
  );
}
