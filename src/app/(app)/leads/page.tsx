import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Pagination, DEFAULT_PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { withTiming } from "@/lib/perf";
import { LeadFilters } from "@/components/leads/lead-filters";
import { BulkAutoAssignButton } from "@/components/leads/bulk-auto-assign-button";
import { LeadsTable } from "@/components/leads/leads-table";
import { SavedViewsBar } from "@/components/saved-views/saved-views-bar";
import { getOrganizationId } from "@/lib/organization";
import { assignedToSelect } from "@/lib/user-select";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const sp = await searchParams;
  const organizationId = getOrganizationId(session!.user);
  const page = parsePage(sp.page);

  const where: Prisma.LeadWhereInput = { organizationId };
  if (session!.user.role === "FIELD_EXECUTIVE") where.assignedToId = session!.user.id;
  if (sp.q) where.OR = [{ clientName: { contains: sp.q } }, { phone: { contains: sp.q } }, { leadCode: { contains: sp.q } }];
  if (sp.source) where.source = sp.source as never;
  if (sp.status) where.status = sp.status as never;
  if (sp.priority) where.priority = sp.priority as never;
  if (sp.assignedToId) where.assignedToId = sp.assignedToId === "unassigned" ? null : sp.assignedToId;
  if (sp.requirementType) where.requirementType = sp.requirementType as never;
  if (sp.assetClass) where.assetClass = sp.assetClass as never;
  if (sp.transactionType) where.transactionType = sp.transactionType as never;

  const [leads, totalCount, employees, unassignedCount] = await withTiming("leadsPageQuery", "/leads", () =>
    Promise.all([
      prisma.lead.findMany({ where, include: { assignedTo: { select: assignedToSelect } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * DEFAULT_PAGE_SIZE, take: DEFAULT_PAGE_SIZE }),
      prisma.lead.count({ where }),
      // Only id/name are rendered (assignment filter + bulk-assign dropdowns) -
      // select instead of a bare findMany() so passwordHash and other account
      // fields never leave the server for this dropdown data.
      prisma.user.findMany({ where: { organizationId, role: { in: ["FIELD_EXECUTIVE", "DATA_MANAGER"] }, status: "ACTIVE" }, select: assignedToSelect }),
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
      <SavedViewsBar entityType="LEAD" />

      {leads.length === 0 ? (
        <EmptyState title="No matching leads" description="Try adjusting your filters, or wait for new leads to arrive via digital portals & WhatsApp." />
      ) : (
        <LeadsTable leads={leads} employees={employees} canManage={canManage} />
      )}

      <Pagination basePath="/leads" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={totalCount} />
    </div>
  );
}
