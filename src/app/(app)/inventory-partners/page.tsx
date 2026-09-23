import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Pagination, DEFAULT_PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { getActivePropertyCountsByPartner } from "@/lib/inventory-partners";
import { getOrganizationId } from "@/lib/organization";
import { Plus, Phone, Building2 } from "lucide-react";
import type { Prisma } from "@prisma/client";

export default async function InventoryPartnersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const sp = await searchParams;
  const canCreate = session?.user?.role === "ADMIN" || session?.user?.role === "DATA_MANAGER";
  const page = parsePage(sp.page);
  const organizationId = getOrganizationId(session?.user);

  const where: Prisma.InventoryPartnerWhereInput = { organizationId };
  if (sp.q) {
    where.OR = [
      { name: { contains: sp.q } },
      { phone: { contains: sp.q } },
      { company: { contains: sp.q } },
      { partnerCode: { contains: sp.q } },
    ];
  }
  if (sp.isActive) where.isActive = sp.isActive === "true";

  const [partners, totalCount] = await Promise.all([
    prisma.inventoryPartner.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * DEFAULT_PAGE_SIZE, take: DEFAULT_PAGE_SIZE }),
    prisma.inventoryPartner.count({ where }),
  ]);

  const activeCounts = await getActivePropertyCountsByPartner(partners.map((p) => p.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E4E4E7] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#09090B]">Inventory Partners</h1>
          <p className="mt-1 text-sm text-[#52525B]">{totalCount} partner{totalCount === 1 ? "" : "s"} supplying indirect inventory (dealers, builders, society offices)</p>
        </div>
        {canCreate && (
          <LinkButton href="/inventory-partners/new" className="w-full sm:w-auto">
            <Plus className="h-4 w-4" /> Add Inventory Partner
          </LinkButton>
        )}
      </div>

      {partners.length === 0 ? (
        <EmptyState title="No inventory partners yet" description="Add a partner to start linking indirect properties to them instead of duplicating their details on every listing." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {partners.map((p) => (
            <Link
              key={p.id}
              href={`/inventory-partners/${p.id}`}
              className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs hover:border-[#0A0A0A] transition-colors block group"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm text-[#09090B] group-hover:underline">{p.name}</p>
                  {p.company && <p className="text-xs text-[#52525B] flex items-center gap-1 mt-0.5"><Building2 className="h-3 w-3" /> {p.company}</p>}
                </div>
                <Badge tone={p.isActive ? "green" : "slate"}>{p.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="text-xs text-[#52525B] flex items-center gap-1.5 mt-2.5"><Phone className="h-3 w-3 text-[#71717A]" /> {p.phone}</p>
              <div className="mt-4 pt-3 border-t border-[#F4F4F5] flex items-center justify-between text-xs">
                <span className="text-[#71717A] font-mono">{p.partnerCode}</span>
                <span className="font-semibold text-[#09090B]">{activeCounts.get(p.id) ?? 0} active propert{(activeCounts.get(p.id) ?? 0) === 1 ? "y" : "ies"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Pagination basePath="/inventory-partners" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={totalCount} />
    </div>
  );
}
