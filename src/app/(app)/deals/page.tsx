import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { Badge } from "@/components/ui/badge";

export default async function DealsPage() {
  const session = await auth();
  const organizationId = getOrganizationId(session!.user);
  const deals = await prisma.deal.findMany({
    where: { organizationId, ...(session!.user.role === "FIELD_EXECUTIVE" ? { assignedToId: session!.user.id } : {}) },
    include: {
      lead: { select: { clientName: true } },
      property: { select: { title: true, propertyCode: true, inventorySource: true, partner: { select: { name: true } } } },
      assignedTo: { select: { name: true } },
      offers: { select: { amount: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      activities: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4E4E7] pb-4">
        <h1 className="text-2xl font-bold text-[#09090B]">Deals & Negotiations</h1>
        <p className="mt-1 text-sm text-[#52525B]">Internal negotiation pipeline across active leads and inventory</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[#E4E4E7] bg-white shadow-xs">
        <table className="w-full text-sm">
          <thead className="bg-[#FAFAFA] text-left text-xs font-semibold uppercase tracking-wider text-[#71717A] border-b border-[#E4E4E7]">
            <tr>
              <th className="px-4 py-3.5">Client / Property</th>
              <th className="px-4 py-3.5">Source</th>
              <th className="px-4 py-3.5">Stage</th>
              <th className="px-4 py-3.5">Latest Offer</th>
              <th className="px-4 py-3.5">Owner</th>
              <th className="px-4 py-3.5">Last Activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E4E7] text-[#52525B]">
            {deals.map((d) => (
              <tr key={d.id} className="hover:bg-[#FAFAFA] transition-colors">
                <td className="px-4 py-3.5">
                  <Link className="font-semibold text-[#09090B] hover:underline" href={`/deals/${d.id}`}>
                    {d.lead?.clientName ?? "Unassigned lead"}
                  </Link>
                  <div className="text-xs text-[#71717A] mt-0.5">{d.property?.propertyCode} · {d.property?.title}</div>
                </td>
                <td className="px-4 py-3.5">
                  <div>{d.property?.inventorySource ?? "—"}</div>
                  {d.property?.partner ? <div className="text-xs text-[#71717A]">{d.property.partner.name}</div> : null}
                </td>
                <td className="px-4 py-3.5">
                  <Badge tone="slate">{d.stage}</Badge>
                </td>
                <td className="px-4 py-3.5 font-medium text-[#09090B]">
                  {d.offers[0] ? `₹${d.offers[0].amount.toLocaleString("en-IN")}` : "—"}
                </td>
                <td className="px-4 py-3.5">{d.assignedTo?.name ?? "—"}</td>
                <td className="px-4 py-3.5 text-xs text-[#71717A]">{d.activities[0]?.createdAt.toLocaleDateString() ?? "—"}</td>
              </tr>
            ))}
            {deals.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#71717A]">
                  No deals in progress.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
