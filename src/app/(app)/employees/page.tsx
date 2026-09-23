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
import { formatLastLogin } from "@/lib/last-login";
import { auth } from "@/lib/auth";
import { getSystemConfig } from "@/lib/system-config";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const session = await auth();
  const organizationId = getOrganizationId(session!.user);
  const { employeeDirectoryLabel } = await getSystemConfig(organizationId);

  const { employees, totalCount } = await withTiming("employeesPageQuery", "/employees", () =>
    cached(`employees:list:${organizationId}:${page}`, 30, () =>
      Promise.all([
        prisma.user.findMany({
          where: { organizationId },
          select: {
            id: true, name: true, role: true, email: true, phone: true,
            maxActiveLeads: true, isAvailable: true, lastLoginAt: true, status: true,
            _count: { select: { assignedLeads: true, assignedVisits: true, followUps: true } },
          },
          orderBy: { createdAt: "asc" },
          skip: (page - 1) * DEFAULT_PAGE_SIZE,
          take: DEFAULT_PAGE_SIZE,
        }),
        prisma.user.count({ where: { organizationId } }),
      ]).then(([employees, totalCount]) => ({ employees, totalCount }))
    )
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E4E4E7] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#09090B]">{employeeDirectoryLabel} & Operations Directory</h1>
          <p className="mt-1 text-sm text-[#52525B]">{totalCount} team members across organization</p>
        </div>
        <AddEmployeeModal />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E4E4E7] bg-white shadow-xs">
        <table className="min-w-full divide-y divide-[#E4E4E7] text-sm">
          <thead className="bg-[#FAFAFA] text-left text-xs font-semibold uppercase tracking-wider text-[#71717A]">
            <tr>
              <th className="px-4 py-3.5">Name</th>
              <th className="px-4 py-3.5">Role</th>
              <th className="px-4 py-3.5">Contact</th>
              <th className="px-4 py-3.5">Capacity</th>
              <th className="px-4 py-3.5">Visits</th>
              <th className="px-4 py-3.5">Follow-ups</th>
              <th className="px-4 py-3.5">Availability</th>
              <th className="px-4 py-3.5">Last Sign-in</th>
              <th className="px-4 py-3.5">Account</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E4E7] text-[#52525B]">
            {employees.map((e) => (
              <tr key={e.id} className="hover:bg-[#FAFAFA] transition-colors">
                <td className="px-4 py-3.5 font-semibold text-[#09090B]">
                  <Link href={`/employees/${e.id}`} className="hover:underline">{e.name}</Link>
                </td>
                <td className="px-4 py-3.5">{ROLE_LABELS[e.role]}</td>
                <td className="px-4 py-3.5">
                  <p className="text-[#09090B]">{e.email}</p>
                  {e.phone && <p className="text-xs text-[#71717A] font-mono mt-0.5">{e.phone}</p>}
                </td>
                <td className="px-4 py-3.5 font-medium text-[#09090B]">
                  {e.role === "FIELD_EXECUTIVE" ? `${e._count.assignedLeads} / ${e.maxActiveLeads}` : e._count.assignedLeads}
                </td>
                <td className="px-4 py-3.5 font-medium text-[#09090B]">{e._count.assignedVisits}</td>
                <td className="px-4 py-3.5 font-medium text-[#09090B]">{e._count.followUps}</td>
                <td className="px-4 py-3.5">
                  {e.role === "FIELD_EXECUTIVE" ? <Badge tone={e.isAvailable ? "green" : "slate"}>{e.isAvailable ? "Available" : "Unavailable"}</Badge> : "-"}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-xs">{formatLastLogin(e.lastLoginAt)}</td>
                <td className="px-4 py-3.5"><StatusToggle status={e.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination basePath="/employees" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={totalCount} />
    </div>
  );
}
