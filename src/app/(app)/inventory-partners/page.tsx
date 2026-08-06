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
  const organizationId = getOrganizationId(session?.user?.id);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E7ECF2] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">Inventory Partners</h1>
          <p className="mt-1 text-sm text-[#596579]">{totalCount} partner{totalCount === 1 ? "" : "s"} bringing in indirect inventory - other companies, dealers, builders, and society offices</p>
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
            <a
              key={p.id}
              href={`/inventory-partners/${p.id}`}
              className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs hover:border-[#3366FF]/40 transition block"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[#1B2430]">{p.name}</p>
                  {p.company && <p className="text-xs text-[#596579] flex items-center gap-1 mt-0.5"><Building2 className="h-3 w-3" /> {p.company}</p>}
                </div>
                <Badge tone={p.isActive ? "green" : "slate"}>{p.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="text-xs text-[#596579] flex items-center gap-1 mt-2"><Phone className="h-3 w-3" /> {p.phone}</p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-[#596579]">{p.partnerCode}</span>
                <span className="font-semibold text-[#3366FF]">{activeCounts.get(p.id) ?? 0} active propert{(activeCounts.get(p.id) ?? 0) === 1 ? "y" : "ies"}</span>
              </div>
            </a>
          ))}
        </div>
      )}

      <Pagination basePath="/inventory-partners" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={totalCount} />
    </div>
  );
}
