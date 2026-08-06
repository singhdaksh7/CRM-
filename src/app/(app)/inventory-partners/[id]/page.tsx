import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { getActivePropertyCount } from "@/lib/inventory-partners";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Pencil, Phone, Building2 } from "lucide-react";

export default async function InventoryPartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = getOrganizationId(session?.user?.id);
  const canManage = session?.user?.role === "ADMIN" || session?.user?.role === "DATA_MANAGER";

  const partner = await prisma.inventoryPartner.findFirst({
    where: { id, organizationId },
    include: {
      properties: { orderBy: { createdAt: "desc" } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!partner) notFound();

  const activePropertyCount = await getActivePropertyCount(id);
  const localities: string[] = partner.localities ? JSON.parse(partner.localities) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-[#E7ECF2] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">{partner.name}</h1>
            <Badge tone={partner.isActive ? "green" : "slate"}>{partner.isActive ? "Active" : "Inactive"}</Badge>
          </div>
          <p className="mt-1 text-sm text-[#596579]">{partner.partnerCode}</p>
        </div>
        {canManage && (
          <LinkButton href={`/inventory-partners/${id}/edit`} variant="secondary">
            <Pencil className="h-4 w-4" /> Edit
          </LinkButton>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
          <p className="text-xs text-[#596579]">Phone</p>
          <p className="mt-1 font-semibold text-[#1B2430] flex items-center gap-1"><Phone className="h-4 w-4" /> {partner.phone}</p>
        </div>
        {partner.company && (
          <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
            <p className="text-xs text-[#596579]">Company</p>
            <p className="mt-1 font-semibold text-[#1B2430] flex items-center gap-1"><Building2 className="h-4 w-4" /> {partner.company}</p>
          </div>
        )}
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
          <p className="text-xs text-[#596579]">Active Properties</p>
          <p className="mt-1 text-2xl font-bold text-[#3366FF]">{activePropertyCount}</p>
        </div>
        {partner.commissionSplitPct !== null && (
          <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
            <p className="text-xs text-[#596579]">Commission Split</p>
            <p className="mt-1 font-semibold text-[#1B2430]">{partner.commissionSplitPct}%</p>
          </div>
        )}
      </div>

      {localities.length > 0 && (
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
          <p className="text-xs text-[#596579] mb-2">Localities Covered</p>
          <div className="flex flex-wrap gap-2">
            {localities.map((l) => (
              <Badge key={l} tone="blue">{l}</Badge>
            ))}
          </div>
        </div>
      )}

      {partner.notes && (
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
          <p className="text-xs text-[#596579] mb-1">Notes</p>
          <p className="text-sm text-[#1B2430] whitespace-pre-wrap">{partner.notes}</p>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-[#1B2430] mb-3">Properties ({partner.properties.length})</h2>
        {partner.properties.length === 0 ? (
          <EmptyState title="No properties linked yet" description="Link a property to this partner from the property form (set Inventory Source to Indirect)." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {partner.properties.map((prop) => (
              <a key={prop.id} href={`/properties/${prop.id}`} className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs hover:border-[#3366FF]/40 transition block">
                <p className="font-semibold text-[#1B2430]">{prop.title}</p>
                <p className="text-xs text-[#596579] mt-1">{prop.area} - {prop.propertyCode}</p>
                <Badge tone={prop.status === "AVAILABLE" ? "green" : "slate"} className="mt-2">{prop.status}</Badge>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
