import { notFound } from "next/navigation";
import Link from "next/link";
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
  const organizationId = getOrganizationId(session?.user);
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-zinc-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{partner.name}</h1>
            <Badge tone={partner.isActive ? "green" : "slate"}>{partner.isActive ? "Active" : "Inactive"}</Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-500">{partner.partnerCode}</p>
        </div>
        {canManage && (
          <LinkButton href={`/inventory-partners/${id}/edit`} variant="secondary">
            <Pencil className="h-4 w-4" /> Edit
          </LinkButton>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
          <p className="text-xs text-zinc-500">Phone</p>
          <p className="mt-1 font-semibold text-zinc-900 flex items-center gap-1"><Phone className="h-4 w-4" /> {partner.phone}</p>
        </div>
        {partner.company && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
            <p className="text-xs text-zinc-500">Company</p>
            <p className="mt-1 font-semibold text-zinc-900 flex items-center gap-1"><Building2 className="h-4 w-4" /> {partner.company}</p>
          </div>
        )}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
          <p className="text-xs text-zinc-500">Active Properties</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{activePropertyCount}</p>
        </div>
        {partner.commissionSplitPct !== null && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
            <p className="text-xs text-zinc-500">Commission Split</p>
            <p className="mt-1 font-semibold text-zinc-900">{partner.commissionSplitPct}%</p>
          </div>
        )}
      </div>

      {localities.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
          <p className="text-xs text-zinc-500 mb-2 font-medium">Localities Covered</p>
          <div className="flex flex-wrap gap-2">
            {localities.map((l) => (
              <Badge key={l} tone="slate">{l}</Badge>
            ))}
          </div>
        </div>
      )}

      {partner.notes && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
          <p className="text-xs text-zinc-500 mb-1 font-medium">Notes</p>
          <p className="text-sm text-zinc-900 whitespace-pre-wrap">{partner.notes}</p>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Properties ({partner.properties.length})</h2>
        {partner.properties.length === 0 ? (
          <EmptyState title="No properties linked yet" description="Link a property to this partner from the property form (set Inventory Source to Indirect)." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {partner.properties.map((prop) => (
              <Link key={prop.id} href={`/properties/${prop.id}`} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs hover:border-zinc-900 transition-colors block">
                <p className="font-semibold text-zinc-900">{prop.title}</p>
                <p className="text-xs text-zinc-500 mt-1">{prop.area} - {prop.propertyCode}</p>
                <Badge tone={prop.status === "AVAILABLE" ? "green" : "slate"} className="mt-2">{prop.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
