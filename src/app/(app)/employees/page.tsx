import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/permissions";
import { AddEmployeeModal } from "@/components/employees/employee-modal";
import { StatusToggle } from "@/components/employees/status-toggle";
import { Badge } from "@/components/ui/badge";
import { Pagination, DEFAULT_PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { getOrganizationId } from "@/lib/organization";
import { withTiming } from "@/lib/perf";
import { cached } from "@/lib/cache";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const organizationId = getOrganizationId();

  // Directory listing is a good short-lived cache candidate (30s) - it's
  // not used for any permission or financial decision, just display.
  // Invalidated immediately on create/update (see /api/employees routes).
  const { employees, totalCount } = await withTiming("employeesPageQuery", "/employees", () =>
    cached(`employees:list:${organizationId}:${page}`, 30, () =>
      Promise.all([
        prisma.user.findMany({
          where: { organizationId },
          include: { _count: { select: { assignedLeads: true, assignedVisits: true, followUps: true } } },
          orderBy: { createdAt: "asc" },
          skip: (page - 1) * DEFAULT_PAGE_SIZE,
          take: DEFAULT_PAGE_SIZE,
        }),
        prisma.user.count({ where: { organizationId } }),
      ]).then(([employees, totalCount]) => ({ employees, totalCount }))
    )
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[rgba(255,255,255,0.08)] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F8FAFC]">Team & Operations Directory</h1>
          <p className="mt-1 text-sm text-[#94A3B8]">{totalCount} team members in NCR brokerage network</p>
        </div>
        <AddEmployeeModal />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] shadow-sm">
        <table className="min-w-full divide-y divide-[rgba(255,255,255,0.08)] text-sm">
          <thead className="bg-[#11151F] text-left text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
            <tr>
              <th className="px-4 py-3.5">Name</th>
              <th className="px-4 py-3.5">Role</th>
              <th className="px-4 py-3.5">Contact</th>
              <th className="px-4 py-3.5">Capacity</th>
              <th className="px-4 py-3.5">Visits</th>
              <th className="px-4 py-3.5">Follow-ups</th>
              <th className="px-4 py-3.5">Availability</th>
              <th className="px-4 py-3.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(255,255,255,0.06)] text-[#CBD5E1]">
            {employees.map((e) => (
              <tr key={e.id} className="hover:bg-[#1E2533] transition-colors">
                <td className="px-4 py-3.5 font-bold text-[#F8FAFC]">
                  <Link href={`/employees/${e.id}`} className="hover:text-[#4F8CFF] transition-colors">{e.name}</Link>
                </td>
                <td className="px-4 py-3.5">{ROLE_LABELS[e.role]}</td>
                <td className="px-4 py-3.5">
                  <p>{e.email}</p>
                  {e.phone && <p className="text-xs text-[#94A3B8] font-mono mt-0.5">{e.phone}</p>}
                </td>
                <td className="px-4 py-3.5 font-semibold">
                  {e.role === "FIELD_EXECUTIVE" ? `${e._count.assignedLeads} / ${e.maxActiveLeads}` : e._count.assignedLeads}
                </td>
                <td className="px-4 py-3.5 font-semibold text-[#4F8CFF]">{e._count.assignedVisits}</td>
                <td className="px-4 py-3.5 font-semibold text-[#A78BFA]">{e._count.followUps}</td>
                <td className="px-4 py-3.5">
                  {e.role === "FIELD_EXECUTIVE" ? <Badge tone={e.isAvailable ? "green" : "slate"}>{e.isAvailable ? "Available" : "Unavailable"}</Badge> : "-"}
                </td>
                <td className="px-4 py-3.5"><StatusToggle employeeId={e.id} status={e.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination basePath="/employees" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={totalCount} />
    </div>
  );
}
