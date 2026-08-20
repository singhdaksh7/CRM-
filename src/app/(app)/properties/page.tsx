import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PropertyFilters } from "@/components/properties/property-filters";
import { PropertiesTable } from "@/components/properties/properties-table";
import { SavedViewsBar } from "@/components/saved-views/saved-views-bar";
import { PropertyCard } from "@/components/properties/property-card";
import { EmptyState } from "@/components/ui/states";
import { LinkButton } from "@/components/ui/button";
import { Pagination, DEFAULT_PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { withTiming } from "@/lib/perf";
import { getCoverImageUrls } from "@/lib/property-images";
import { getOrganizationId } from "@/lib/organization";
import { Plus, Upload, History } from "lucide-react";
import type { Prisma } from "@prisma/client";

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const organizationId = getOrganizationId(session!.user.id);
  const sp = await searchParams;
  const view = sp.view === "table" ? "table" : "card";
  const canCreate = session?.user?.role === "ADMIN" || session?.user?.role === "DATA_MANAGER";
  const page = parsePage(sp.page);

  const where: Prisma.PropertyWhereInput = { organizationId };
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
  if (sp.status) where.status = sp.status as never;
  if (sp.area) where.area = sp.area;
  if (sp.bhk) where.bhk = Number(sp.bhk);
  if (sp.furnishing) where.furnishing = sp.furnishing as never;

  const orderBy: Prisma.PropertyOrderByWithRelationInput =
    sp.sort === "oldest" ? { createdAt: "asc" } : sp.sort === "price_low" ? { monthlyRent: "asc" } : sp.sort === "price_high" ? { monthlyRent: "desc" } : { createdAt: "desc" };

  const [properties, totalCount] = await withTiming("propertiesPageQuery", "/properties", () =>
    Promise.all([
      prisma.property.findMany({ where, orderBy, skip: (page - 1) * DEFAULT_PAGE_SIZE, take: DEFAULT_PAGE_SIZE }),
      prisma.property.count({ where }),
    ])
  );

  const coverImageUrls =
    view === "card" && properties.length > 0 ? await getCoverImageUrls(properties.map((p) => p.id), organizationId) : {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E7ECF2] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">Property Inventory</h1>
          <p className="mt-1 text-sm text-[#596579]">{totalCount} active listings in Delhi-NCR portfolio</p>
        </div>
        {canCreate && <div className="flex flex-wrap gap-2"><LinkButton href="/properties/import/history" variant="secondary"><History className="h-4 w-4"/> Import history</LinkButton><LinkButton href="/properties/import" variant="secondary"><Upload className="h-4 w-4"/> Import Excel/CSV</LinkButton><LinkButton href="/properties/new"><Plus className="h-4 w-4" /> Add Property</LinkButton></div>}
      </div>

      <PropertyFilters view={view} />
      <SavedViewsBar entityType="PROPERTY" />

      {properties.length === 0 ? (
        <EmptyState title="No matching properties" description="Try adjusting your filters or search query to find inventory." />
      ) : view === "card" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} coverImageUrl={coverImageUrls[p.id]} />
          ))}
        </div>
      ) : (
        <PropertiesTable properties={properties} canManage={canCreate} />
      )}

      <Pagination basePath="/properties" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={totalCount} />
    </div>
  );
}
