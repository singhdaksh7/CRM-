import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge, LEAD_STATUS_TONE, LEAD_PRIORITY_TONE } from "@/components/ui/badge";
import { formatINR, formatDate, enumToLabel } from "@/lib/utils";
import { LeadWorkspace } from "@/components/leads/lead-workspace";
import { getLeadHealth, getLeadSuggestions, computeVisitSuggestions } from "@/lib/rules";
import { Phone, Mail, MapPin, Wallet } from "lucide-react";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      assignedTo: true,
      activities: { orderBy: { createdAt: "desc" }, include: { actor: true } },
      followUps: { orderBy: { dueDate: "asc" }, include: { owner: true } },
      visits: { orderBy: { visitDate: "desc" }, include: { property: true, assignedTo: true } },
      sharedProperties: { orderBy: { createdAt: "desc" } },
      matchRecommendations: { where: { status: "PENDING" }, orderBy: { score: "desc" }, include: { property: { select: { id: true, propertyCode: true, title: true, area: true, bhk: true, monthlyRent: true, salePrice: true, listingType: true, inventorySource: true, status: true, coverImage: true, lastVerifiedAt: true, pendingVerification: true } } } },
      catalogueShares: { where: { status: "ACTIVE" }, select: { id: true, title: true, version: true }, orderBy: { updatedAt: "desc" } },
    },
  });
  if (!lead) notFound();
  if (session!.user.role === "FIELD_EXECUTIVE" && lead.assignedToId !== session!.user.id) notFound();

  const employees = await prisma.user.findMany({ where: { role: { in: ["FIELD_EXECUTIVE", "DATA_MANAGER"] }, status: "ACTIVE" } });
  const canManage = session!.user.role === "ADMIN" || session!.user.role === "DATA_MANAGER";
  const [health, suggestions] = await Promise.all([getLeadHealth(lead.id), getLeadSuggestions(lead.id, canManage)]);
  const hasPendingFollowUp = lead.followUps.some((f) => f.status === "PENDING");
  const visitSuggestions = Object.fromEntries(
    lead.visits.map((v) => [
      v.id,
      computeVisitSuggestions({
        visitId: v.id,
        leadId: lead.id,
        status: v.status,
        outcome: v.outcome,
        visitDate: v.visitDate,
        leadStatus: lead.status,
        hasPendingFollowUpForLead: hasPendingFollowUp,
      }),
    ])
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-xs text-[#8A94A6]">{lead.leadCode}</span>
              <Badge tone={LEAD_STATUS_TONE[lead.status]}>{enumToLabel(lead.status)}</Badge>
              <Badge tone={LEAD_PRIORITY_TONE[lead.priority]}>{lead.priority}</Badge>
            </div>
            <h1 className="text-xl font-semibold text-[#1B2430]">{lead.clientName}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#596579]">
              <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {lead.phone}</span>
              {lead.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {lead.email}</span>}
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {lead.preferredLocation}</span>
              <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> {formatINR(lead.minBudget, { compact: true })} - {formatINR(lead.maxBudget, { compact: true })}</span>
            </div>
          </div>
          <div className="text-right text-xs text-[#8A94A6]">
            <p>{lead.requirementType === "RENT" ? "Looking to Rent" : "Looking to Buy"} &middot; {lead.preferredBhk ? `${lead.preferredBhk} BHK` : "Any BHK"}</p>
            <p>Created {formatDate(lead.createdAt)}</p>
            {lead.nextFollowUpAt && <p>Next follow-up: {formatDate(lead.nextFollowUpAt)}</p>}
          </div>
        </div>
        {lead.additionalRequirements && <p className="mt-3 rounded-xl bg-[#FAFBFC] border border-[#E7ECF2] p-3 text-sm text-[#596579]">{lead.additionalRequirements}</p>}
      </div>

      <LeadWorkspace lead={lead} employees={employees} role={session!.user.role} health={health} suggestions={suggestions} visitSuggestions={visitSuggestions} />
    </div>
  );
}
