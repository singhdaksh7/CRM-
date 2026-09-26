import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/permissions";
import { Badge, LEAD_STATUS_TONE, VISIT_STATUS_TONE, FOLLOWUP_STATUS_TONE } from "@/components/ui/badge";
import { StatusToggle } from "@/components/employees/status-toggle";
import { EmployeeAssignmentSettings } from "@/components/employees/assignment-settings";
import { formatDate, formatDateTime, enumToLabel } from "@/lib/utils";
import { Clock, Mail, Phone } from "lucide-react";
import { getOrganizationId } from "@/lib/organization";
import { EmployeeAccountControls } from "@/components/employees/account-controls";
import { EditEmployeeModal } from "@/components/employees/edit-employee-modal";
import { formatLastLogin } from "@/lib/last-login";
import { auth } from "@/lib/auth";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const employee = await prisma.user.findFirst({
    where: { id, organizationId: getOrganizationId(session!.user) },
    include: {
      assignedLeads: { orderBy: { createdAt: "desc" } },
      assignedVisits: { include: { property: true, lead: true }, orderBy: { visitDate: "desc" } },
      followUps: { include: { lead: true, crmOwner: true }, orderBy: { dueDate: "asc" } },
      serviceAreas: { orderBy: { priority: "desc" } },
    },
  });
  if (!employee) notFound();

  const closedWon = employee.assignedLeads.filter((l) => l.status === "CLOSED_WON").length;
  const activeLeads = employee.assignedLeads.filter((l) => !["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"].includes(l.status)).length;
  const completedVisits = employee.assignedVisits.filter((v) => v.status === "COMPLETED").length;
  const pendingFollowUps = employee.followUps.filter((f) => f.status !== "COMPLETED").length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0A0A0A] text-lg font-bold text-white shadow-xs">
              {employee.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">{employee.name}</h1>
              <p className="text-sm text-zinc-500">{ROLE_LABELS[employee.role]}</p>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-400">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {employee.email}</span>
                {employee.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {employee.phone}</span>}
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last sign-in: {formatLastLogin(employee.lastLoginAt)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusToggle status={employee.status} />
            <EditEmployeeModal
              employeeId={employee.id}
              initial={{ name: employee.name, phone: employee.phone, role: employee.role, notes: employee.notes }}
            />
          </div>
        </div>
        {employee.notes && <p className="mt-3 rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-sm text-zinc-600">{employee.notes}</p>}
        <div className="mt-4">
          <EmployeeAccountControls employeeId={employee.id} employeeName={employee.name} status={employee.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Active Leads" value={activeLeads} />
        <Stat label="Deals Closed" value={closedWon} />
        <Stat label="Visits Completed" value={completedVisits} />
        <Stat label="Pending Follow-ups" value={pendingFollowUps} />
      </div>

      {employee.role === "FIELD_EXECUTIVE" && (
        <EmployeeAssignmentSettings
          employeeId={employee.id}
          speciality={employee.speciality}
          maxActiveLeads={employee.maxActiveLeads}
          isAvailable={employee.isAvailable}
          autoAssignEnabled={employee.autoAssignEnabled}
          serviceAreas={employee.serviceAreas}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
          <h3 className="mb-3 text-sm font-bold text-zinc-900">Assigned Leads</h3>
          <div className="space-y-2">
            {employee.assignedLeads.length === 0 && <p className="text-sm text-zinc-400">No leads assigned.</p>}
            {employee.assignedLeads.slice(0, 10).map((l) => (
              <div key={l.id} className="flex items-center justify-between border-b border-zinc-100 pb-2 last:border-0">
                <Link href={`/leads/${l.id}`} className="text-sm font-medium text-zinc-900 hover:underline">{l.clientName}</Link>
                <Badge tone={LEAD_STATUS_TONE[l.status]}>{enumToLabel(l.status)}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
          <h3 className="mb-3 text-sm font-bold text-zinc-900">Scheduled Visits</h3>
          <div className="space-y-2">
            {employee.assignedVisits.length === 0 && <p className="text-sm text-zinc-400">No visits scheduled.</p>}
            {employee.assignedVisits.slice(0, 10).map((v) => (
              <div key={v.id} className="flex items-center justify-between border-b border-zinc-100 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{v.property.title}</p>
                  <p className="text-xs text-zinc-400">{formatDate(v.visitDate)} &middot; {v.lead.clientName}</p>
                </div>
                <Badge tone={VISIT_STATUS_TONE[v.status]}>{enumToLabel(v.status)}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs lg:col-span-2">
          <h3 className="mb-3 text-sm font-bold text-zinc-900">Follow-ups</h3>
          <div className="space-y-2">
            {employee.followUps.length === 0 && <p className="text-sm text-zinc-400">No follow-ups.</p>}
            {employee.followUps.slice(0, 10).map((f) => (
              <div key={f.id} className="flex items-center justify-between border-b border-zinc-100 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{enumToLabel(f.type)} &middot; {f.lead?.clientName ?? f.crmOwner?.name ?? "—"}</p>
                  <p className="text-xs text-zinc-400">{formatDateTime(f.dueDate)}</p>
                </div>
                <Badge tone={FOLLOWUP_STATUS_TONE[f.status]}>{enumToLabel(f.status)}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
      <p className="text-xs font-semibold text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
    </div>
  );
}
