import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/permissions";
import { Badge, LEAD_STATUS_TONE, VISIT_STATUS_TONE, FOLLOWUP_STATUS_TONE } from "@/components/ui/badge";
import { StatusToggle } from "@/components/employees/status-toggle";
import { EmployeeAssignmentSettings } from "@/components/employees/assignment-settings";
import { formatDate, formatDateTime, enumToLabel } from "@/lib/utils";
import { Mail, Phone } from "lucide-react";
import { getOrganizationId } from "@/lib/organization";
import { SetupLinkActions } from "@/components/employees/setup-link-actions";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employee = await prisma.user.findFirst({
    where: { id, organizationId: getOrganizationId() },
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
      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#3366FF] text-lg font-bold text-white shadow-xs">
              {employee.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#1B2430]">{employee.name}</h1>
              <p className="text-sm text-[#596579]">{ROLE_LABELS[employee.role]}</p>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-[#8A94A6]">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {employee.email}</span>
                {employee.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {employee.phone}</span>}
              </div>
            </div>
          </div>
          <StatusToggle employeeId={employee.id} status={employee.status} />
        </div>
        {employee.notes && <p className="mt-3 rounded-xl bg-[#FAFBFC] border border-[#E7ECF2] p-3 text-sm text-[#596579]">{employee.notes}</p>}
        {employee.status === "PENDING_SETUP" && <div className="mt-4"><SetupLinkActions employeeId={employee.id} employeeName={employee.name} /></div>}
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
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
          <h3 className="mb-3 text-sm font-bold text-[#1B2430]">Assigned Leads</h3>
          <div className="space-y-2">
            {employee.assignedLeads.length === 0 && <p className="text-sm text-[#8A94A6]">No leads assigned.</p>}
            {employee.assignedLeads.slice(0, 10).map((l) => (
              <div key={l.id} className="flex items-center justify-between border-b border-[#EFF4FF] pb-2 last:border-0">
                <Link href={`/leads/${l.id}`} className="text-sm font-medium text-[#1B2430] hover:text-[#3366FF]">{l.clientName}</Link>
                <Badge tone={LEAD_STATUS_TONE[l.status]}>{enumToLabel(l.status)}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
          <h3 className="mb-3 text-sm font-bold text-[#1B2430]">Scheduled Visits</h3>
          <div className="space-y-2">
            {employee.assignedVisits.length === 0 && <p className="text-sm text-[#8A94A6]">No visits scheduled.</p>}
            {employee.assignedVisits.slice(0, 10).map((v) => (
              <div key={v.id} className="flex items-center justify-between border-b border-[#EFF4FF] pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-[#1B2430]">{v.property.title}</p>
                  <p className="text-xs text-[#8A94A6]">{formatDate(v.visitDate)} &middot; {v.lead.clientName}</p>
                </div>
                <Badge tone={VISIT_STATUS_TONE[v.status]}>{enumToLabel(v.status)}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs lg:col-span-2">
          <h3 className="mb-3 text-sm font-bold text-[#1B2430]">Follow-ups</h3>
          <div className="space-y-2">
            {employee.followUps.length === 0 && <p className="text-sm text-[#8A94A6]">No follow-ups.</p>}
            {employee.followUps.slice(0, 10).map((f) => (
              <div key={f.id} className="flex items-center justify-between border-b border-[#EFF4FF] pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-[#1B2430]">{enumToLabel(f.type)} &middot; {f.lead?.clientName ?? f.crmOwner?.name ?? "—"}</p>
                  <p className="text-xs text-[#8A94A6]">{formatDateTime(f.dueDate)}</p>
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
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
      <p className="text-xs font-semibold text-[#8A94A6]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#1B2430]">{value}</p>
    </div>
  );
}
