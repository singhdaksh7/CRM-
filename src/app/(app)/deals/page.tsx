import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { Prisma, DealStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { DealFilters } from "@/components/deals/deal-filters";
import { formatDate, enumToLabel } from "@/lib/utils";
import { startOfIstDay, endOfIstDay, startOfIstMonth, endOfIstMonth } from "@/lib/ist-date";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    closerId?: string;
    ownerId?: string;
    markerId?: string;
    period?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await auth();
  const organizationId = getOrganizationId(session!.user);
  const isFieldExecutive = session!.user.role === "FIELD_EXECUTIVE";
  const sp = await searchParams;

  const selectedStatus = sp.status ?? "";
  const selectedCloserId = isFieldExecutive ? session!.user.id : (sp.closerId ?? "");
  const selectedOwnerId = sp.ownerId ?? "";
  const selectedMarkerId = sp.markerId ?? "";
  const selectedPeriod = sp.period ?? "all";

  // Build Date Filter on closedAt
  let closedAtFilter: { gte?: Date; lte?: Date } | undefined = undefined;
  const now = new Date();
  if (selectedPeriod === "today") {
    closedAtFilter = { gte: startOfIstDay(now), lte: endOfIstDay(now) };
  } else if (selectedPeriod === "thisMonth") {
    closedAtFilter = { gte: startOfIstMonth(now), lte: endOfIstMonth(now) };
  } else if (selectedPeriod === "prevMonth") {
    const prevMonthInstant = new Date(startOfIstMonth(now).getTime() - 1);
    closedAtFilter = { gte: startOfIstMonth(prevMonthInstant), lte: endOfIstMonth(prevMonthInstant) };
  } else if (selectedPeriod === "custom" && sp.from && sp.to) {
    const fromDate = new Date(`${sp.from}T00:00:00+05:30`);
    const toDate = new Date(`${sp.to}T23:59:59.999+05:30`);
    if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
      closedAtFilter = { gte: fromDate, lte: toDate };
    }
  }

  // Fetch employees for filter dropdowns (admin & data manager only)
  const employees = !isFieldExecutive
    ? await prisma.user.findMany({
        where: { organizationId, status: "ACTIVE" },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      })
    : [];

  const whereClause: Prisma.DealWhereInput = {
    organizationId,
    ...(selectedStatus ? { status: selectedStatus as DealStatus } : {}),
    ...(selectedCloserId ? { assignedToId: selectedCloserId } : {}),
    ...(selectedOwnerId ? { lead: { assignedToId: selectedOwnerId } } : {}),
    ...(selectedMarkerId ? { createdById: selectedMarkerId } : {}),
    ...(closedAtFilter ? { closedAt: closedAtFilter } : {}),
  };

  const deals = await prisma.deal.findMany({
    where: whereClause,
    include: {
      lead: {
        select: {
          id: true,
          clientName: true,
          leadCode: true,
          assignedTo: { select: { id: true, name: true } },
        },
      },
      property: {
        select: {
          id: true,
          title: true,
          propertyCode: true,
          inventorySource: true,
          partner: { select: { name: true } },
        },
      },
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      offers: { select: { amount: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      activities: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4E4E7] pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[#09090B]">
            {isFieldExecutive ? "My Closed Deals & Negotiations" : "Deals & Negotiations"}
          </h1>
          <p className="mt-1 text-sm text-[#52525B]">
            {isFieldExecutive
              ? "Track your closed deals and ongoing client negotiations"
              : "Internal negotiation pipeline and operational deal closure attribution"}
          </p>
        </div>
      </div>

      <DealFilters
        employees={employees}
        selectedStatus={selectedStatus}
        selectedCloserId={selectedCloserId}
        selectedOwnerId={selectedOwnerId}
        selectedMarkerId={selectedMarkerId}
        selectedPeriod={selectedPeriod}
        customFrom={sp.from}
        customTo={sp.to}
        isFieldExecutive={isFieldExecutive}
      />

      <div className="overflow-x-auto rounded-xl border border-[#E4E4E7] bg-white shadow-xs">
        <table className="w-full text-sm">
          <thead className="bg-[#FAFAFA] text-left text-xs font-semibold uppercase tracking-wider text-[#71717A] border-b border-[#E4E4E7]">
            <tr>
              <th className="px-4 py-3.5">Lead / Client</th>
              <th className="px-4 py-3.5">Property</th>
              <th className="px-4 py-3.5">Lead Owner</th>
              <th className="px-4 py-3.5">Deal Closed By</th>
              <th className="px-4 py-3.5">Marked Closed By</th>
              <th className="px-4 py-3.5">Closed Date</th>
              <th className="px-4 py-3.5">Stage / Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E4E7] text-[#52525B]">
            {deals.map((d) => (
              <tr key={d.id} className="hover:bg-[#FAFAFA] transition-colors">
                <td className="px-4 py-3.5">
                  {d.lead ? (
                    <Link className="font-semibold text-[#09090B] hover:underline" href={`/leads/${d.lead.id}`}>
                      {d.lead.clientName}
                    </Link>
                  ) : (
                    <Link className="font-semibold text-[#09090B] hover:underline" href={`/deals/${d.id}`}>
                      Deal #{d.dealCode}
                    </Link>
                  )}
                  {d.lead?.leadCode && (
                    <div className="text-[11px] font-mono text-[#71717A] mt-0.5">{d.lead.leadCode}</div>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  {d.property ? (
                    <>
                      <div className="font-medium text-[#09090B]">{d.property.title}</div>
                      <div className="text-xs text-[#71717A] mt-0.5">{d.property.propertyCode}</div>
                    </>
                  ) : (
                    <span className="text-[#71717A]">—</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  {d.lead?.assignedTo?.name ? (
                    <span className="font-medium text-[#09090B]">{d.lead.assignedTo.name}</span>
                  ) : (
                    <span className="text-[#71717A]">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <span className="font-semibold text-emerald-700">
                    {d.assignedTo?.name ?? "Unknown / Unassigned"}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-xs text-[#52525B]">
                    {d.createdBy?.name ?? "System / Legacy"}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-xs text-[#71717A]">
                  {d.closedAt ? formatDate(d.closedAt) : "—"}
                </td>
                <td className="px-4 py-3.5">
                  <Badge tone={d.status === "WON" ? "green" : d.status === "LOST" ? "red" : "slate"}>
                    {d.stage === "CLOSED_WON" ? "Deal Won" : d.stage === "CLOSED_LOST" ? "Deal Lost" : enumToLabel(d.stage)}
                  </Badge>
                </td>
              </tr>
            ))}
            {deals.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-[#71717A]">
                  No deals found matching the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
