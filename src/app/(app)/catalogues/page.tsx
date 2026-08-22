import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { EmptyState } from "@/components/ui/states";
import { Eye } from "lucide-react";

const TAKE = 50;

/**
 * Promoted "Catalogues" landing page (simplified-role-workflow, spec item 9):
 * surfaces catalogue-share history org-wide (ADMIN/DATA_MANAGER) or scoped to
 * the field executive's own assigned leads, mirroring /api/catalogues.
 * Read-only here - sending/managing a catalogue still happens from inside a
 * lead's workspace (the CataloguesTab), this page is a discoverable index
 * into that history plus a mobile-friendly card list.
 */
export default async function CataloguesPage() {
  const session = await auth();
  const organizationId = getOrganizationId(session!.user);
  const leadWhere = session!.user.role === "FIELD_EXECUTIVE" ? { assignedToId: session!.user.id } : {};

  const shares = await prisma.catalogueShare.findMany({
    where: { organizationId, lead: leadWhere },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      lastViewedAt: true,
      viewCount: true,
      lead: { select: { id: true, clientName: true, phone: true } },
      _count: { select: { properties: true } },
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#1B2430]">Catalogues</h1>
        <p className="text-sm text-[#596579]">Property catalogues shared with clients - most recent first</p>
      </div>

      {shares.length === 0 ? (
        <EmptyState title="No catalogues shared yet" description="Share a catalogue from inside a lead's workspace to see its history here." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shares.map((share) => (
            <Link
              key={share.id}
              href={`/leads/${share.lead.id}`}
              className="rounded-xl border border-[#E7ECF2] bg-white p-4 shadow-xs hover:border-[#3366FF] transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-[#1B2430] text-sm">{share.title}</h3>
                <span className="rounded-full bg-[#F3F6FA] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#596579]">{share.status}</span>
              </div>
              <p className="mt-1 text-xs text-[#596579]">{share.lead.clientName} &middot; {share.lead.phone}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-[#8A94A6]">
                <span>{share._count.properties} properties</span>
                <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{share.viewCount}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
