import { prisma } from "@/lib/prisma";
import { LeadForm } from "@/components/leads/lead-form";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { assignedToSelect } from "@/lib/user-select";

export default async function NewLeadPage() {
  const session = await auth();
  const employees = await prisma.user.findMany({
    where: { organizationId: getOrganizationId(session!.user), role: { in: ["FIELD_EXECUTIVE", "DATA_MANAGER"] }, status: "ACTIVE" },
    select: assignedToSelect,
  });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Add Lead</h1>
        <p className="text-sm text-slate-500">Manually enter a new client lead.</p>
      </div>
      <LeadForm employees={employees} />
    </div>
  );
}
