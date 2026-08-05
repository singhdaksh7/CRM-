import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LinkButton } from "@/components/ui/button";
import { Badge, LEAD_STATUS_TONE, LEAD_PRIORITY_TONE } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Pagination, DEFAULT_PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { formatINR, formatDate, enumToLabel } from "@/lib/utils";
import { withTiming } from "@/lib/perf";
import { LeadFilters } from "@/components/leads/lead-filters";
import { BulkAutoAssignButton } from "@/components/leads/bulk-auto-assign-button";
import { getOrganizationId } from "@/lib/organization";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const sp = await searchParams;
  const organizationId = getOrganizationId(session!.user.id);
  const page = parsePage(sp.page);

  const where: Prisma.LeadWhereInput = { organizationId };
  if (session!.user.role === "FIELD_EXECUTIVE") where.assignedToId = session!.user.id;
  if (sp.q) where.OR = [{ clientName: { contains: sp.q } }, { phone: { contains: sp.q } }, { leadCode: { contains: sp.q } }];
  if (sp.source) where.source = sp.source as never;
  if (sp.status) where.status = sp.status as never;
  if (sp.priority) where.priority = sp.priority as never;
  if (sp.assignedToId) where.assignedToId = sp.assignedToId === "unassigned" ? null : sp.assignedToId;
  if (sp.requirementType) where.requirementType = sp.requirementType as never;

  const [leads, totalCount, employees, unassignedCount] = await withTiming("leadsPageQuery", "/leads", () =>
    Promise.all([
      prisma.lead.findMany({ where, include: { assignedTo: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * DEFAULT_PAGE_SIZE, take: DEFAULT_PAGE_SIZE }),
      prisma.lead.count({ where }),
      prisma.user.findMany({ where: { organizationId, role: { in: ["FIELD_EXECUTIVE", "DATA_MANAGER"] }, status: "ACTIVE" } }),
      prisma.lead.count({ where: { organizationId, assignedToId: null, status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] } } }),
    ])
  );

  const canCreate = session!.user.role !== "FIELD_EXECUTIVE";
  const canManage = session!.user.role === "ADMIN" || session!.user.role === "DATA_MANAGER";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E7ECF2] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">Leads Pipeline</h1>
          <p className="mt-1 text-sm text-[#596579]">{totalCount} leads {session!.user.role === "FIELD_EXECUTIVE" ? "assigned to you" : "in organization pipeline"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && <BulkAutoAssignButton unassignedCount={unassignedCount} />}
          {canCreate && (
            <LinkButton href="/leads/new" className="w-full sm:w-auto">
              <Plus className="h-4 w-4" /> Add Lead
            </LinkButton>
          )}
        </div>
      </div>

      <LeadFilters employees={employees} />

      {leads.length === 0 ? (
        <EmptyState title="No matching leads" description="Try adjusting your filters, or wait for new leads to arrive via digital portals & WhatsApp." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E7ECF2] bg-white shadow-xs">
          <table className="min-w-full divide-y divide-[#E7ECF2] text-sm">
            <thead className="bg-[#F8F9FF] text-left text-xs font-semibold uppercase tracking-wider text-[#596579]">
              <tr>
                <th className="px-4 py-3.5">Client</th>
                <th className="px-4 py-3.5">Requirement</th>
                <th className="px-4 py-3.5">Budget</th>
                <th className="px-4 py-3.5">Source</th>
                <th className="px-4 py-3.5">Assigned To</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Priority</th>
                <th className="px-4 py-3.5">Score</th>
                <th className="px-4 py-3.5">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFF4FF] text-[#1B2430]">
              {leads.map((l) => (
                <tr key={l.id} className="hover:bg-[#F3F6FA] transition-colors">
                  <td className="px-4 py-3.5">
                    <Link href={`/leads/${l.id}`} className="font-bold text-[#1B2430] hover:text-[#3366FF] transition-colors">{l.clientName}</Link>
                    <p className="text-xs text-[#8A94A6] font-mono mt-0.5">{l.phone}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    {l.requirementType === "RENT" ? "Rent" : "Buy"} &middot; {l.preferredBhk ? `${l.preferredBhk} BHK` : "Any"} &middot; {l.preferredLocation}
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-[#3366FF]">{formatINR(l.minBudget, { compact: true })} - {formatINR(l.maxBudget, { compact: true })}</td>
                  <td className="px-4 py-3.5">{enumToLabel(l.source)}</td>
                  <td className="px-4 py-3.5">{l.assignedTo?.name ?? <span className="font-semibold text-[#E6A23C]">Unassigned</span>}</td>
                  <td className="px-4 py-3.5"><Badge tone={LEAD_STATUS_TONE[l.status]}>{enumToLabel(l.status)}</Badge></td>
                  <td className="px-4 py-3.5"><Badge tone={LEAD_PRIORITY_TONE[l.priority]}>{l.priority}</Badge></td>
                  <td className="px-4 py-3.5 font-bold text-[#1B2430]">{l.score}</td>
                  <td className="px-4 py-3.5 text-xs text-[#8A94A6]">{formatDate(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination basePath="/leads" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={totalCount} />
    </div>
  );
}
