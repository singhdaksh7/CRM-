import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PropertyFilters } from "@/components/properties/property-filters";
import { PropertyCard } from "@/components/properties/property-card";
import { EmptyState } from "@/components/ui/states";
import { LinkButton } from "@/components/ui/button";
import { Badge, PROPERTY_STATUS_TONE } from "@/components/ui/badge";
import { Pagination, DEFAULT_PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { formatINR, formatDate, enumToLabel } from "@/lib/utils";
import { withTiming } from "@/lib/perf";
import { getCoverImageUrls } from "@/lib/property-images";
import { getOrganizationId } from "@/lib/organization";
import { Plus, Building2 } from "lucide-react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const sp = await searchParams;
  const view = sp.view === "table" ? "table" : "card";
  const canCreate = session?.user?.role === "ADMIN" || session?.user?.role === "DATA_MANAGER";
  const page = parsePage(sp.page);

  const where: Prisma.PropertyWhereInput = {};
  if (sp.q) {
    where.OR = [
      { title: { contains: sp.q } },
      { area: { contains: sp.q } },
      { address: { contains: sp.q } },
      { propertyCode: { contains: sp.q } },
    ];
  }
  if (sp.listingType) where.listingType = sp.listingType as never;
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
    view === "card" && properties.length > 0 ? await getCoverImageUrls(properties.map((p) => p.id), getOrganizationId()) : {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[rgba(255,255,255,0.08)] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F8FAFC]">Property Inventory</h1>
          <p className="mt-1 text-sm text-[#94A3B8]">{totalCount} active listings in Delhi-NCR portfolio</p>
        </div>
        {canCreate && (
          <LinkButton href="/properties/new" className="w-full sm:w-auto">
            <Plus className="h-4 w-4" /> Add Property
          </LinkButton>
        )}
      </div>

      <PropertyFilters view={view} />

      {properties.length === 0 ? (
        <EmptyState title="No matching properties" description="Try adjusting your filters or search query to find inventory." />
      ) : view === "card" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} coverImageUrl={coverImageUrls[p.id]} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] shadow-sm">
          <table className="min-w-full divide-y divide-[rgba(255,255,255,0.08)] text-sm">
            <thead className="bg-[#11151F] text-left text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
              <tr>
                <th className="px-4 py-3.5">Code</th>
                <th className="px-4 py-3.5">Title</th>
                <th className="px-4 py-3.5">Location</th>
                <th className="px-4 py-3.5">Type</th>
                <th className="px-4 py-3.5">BHK</th>
                <th className="px-4 py-3.5">Price</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.06)] text-[#CBD5E1]">
              {properties.map((p) => (
                <tr key={p.id} className="hover:bg-[#1E2533] transition-colors">
                  <td className="px-4 py-3.5 font-mono text-xs text-[#94A3B8]">{p.propertyCode}</td>
                  <td className="px-4 py-3.5 font-semibold text-[#F8FAFC]">
                    <Link href={`/properties/${p.id}`} className="hover:text-[#4F8CFF] transition-colors">
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">{p.area}</td>
                  <td className="px-4 py-3.5">{p.listingType === "RENT" ? "Rent" : "Sale"}</td>
                  <td className="px-4 py-3.5">{p.bhk} BHK</td>
                  <td className="px-4 py-3.5 font-bold text-[#4F8CFF]">
                    {p.listingType === "RENT" ? formatINR(p.monthlyRent, { suffix: "month" }) : formatINR(p.salePrice, { compact: true })}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge tone={PROPERTY_STATUS_TONE[p.status]}>{enumToLabel(p.status)}</Badge>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-[#94A3B8]">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination basePath="/properties" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={totalCount} />
    </div>
  );
}
