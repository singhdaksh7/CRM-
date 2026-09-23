import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { fieldExecutiveLeadReadWhere } from "@/lib/lead-access";
import { EmptyState } from "@/components/ui/states";
import { Eye } from "lucide-react";

const TAKE = 50;

export default async function CataloguesPage() {
  const session = await auth();
  const organizationId = getOrganizationId(session!.user);
  const leadWhere = session!.user.role === "FIELD_EXECUTIVE" ? fieldExecutiveLeadReadWhere(session!.user.id) : {};

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
    <div className="space-y-5">
      <div className="border-b border-[#E4E4E7] pb-4">
        <h1 className="text-2xl font-bold text-[#09090B]">Catalogues</h1>
        <p className="mt-1 text-sm text-[#52525B]">Property catalogues shared with clients — track engagement and views</p>
      </div>

      {shares.length === 0 ? (
        <EmptyState title="No catalogues shared yet" description="Share a catalogue from inside a lead's workspace to see its history here." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shares.map((share) => (
            <Link
              key={share.id}
              href={`/leads/${share.lead.id}`}
              className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs hover:border-[#0A0A0A] transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-[#09090B] text-sm group-hover:underline">{share.title}</h3>
                <span className="rounded-full bg-[#F4F4F5] border border-[#E4E4E7] px-2.5 py-0.5 text-[10px] font-semibold uppercase text-[#09090B]">{share.status}</span>
              </div>
              <p className="mt-1.5 text-xs text-[#52525B]">{share.lead.clientName} &middot; {share.lead.phone}</p>
              <div className="mt-4 pt-3 border-t border-[#F4F4F5] flex items-center justify-between text-xs text-[#71717A]">
                <span>{share._count.properties} properties</span>
                <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{share.viewCount} views</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
