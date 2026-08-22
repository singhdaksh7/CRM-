import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PropertyMatchingWorkspace } from "@/components/leads/property-matching-workspace";
import { getOrganizationId } from "@/lib/organization";
import { isLeadAccessibleToUser } from "@/lib/lead-access";

/**
 * Canonical entry point for the unified Property Matching Workspace - browse
 * matches, filter/compare, build a shortlist, and create/send a durable
 * catalogue, all in one screen. `/leads/[id]/catalogue/new` redirects here
 * (see that route) so there is exactly one shortlist-building UI reachable
 * from two links for backward compatibility.
 */
export default async function LeadMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const lead = await prisma.lead.findFirst({ where: { id, organizationId: getOrganizationId(session!.user) } });
  if (!lead) notFound();
  // simplified-role-workflow (Blocker 1 follow-up pass) - was a stale inline
  // check with no unassigned-lead carve-out; now shares the same predicate
  // as leads/[id]/page.tsx and the rest of the read-access surface.
  if (!isLeadAccessibleToUser(lead, session!.user)) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Property Matching Workspace</h1>
        <p className="text-sm text-slate-500">
          For {lead.clientName} &middot; {lead.preferredLocation} &middot; {lead.requirementType === "RENT" ? "Rent" : "Buy"}
        </p>
      </div>
      <PropertyMatchingWorkspace
        lead={{
          id: lead.id,
          clientName: lead.clientName,
          phone: lead.phone,
          preferredLocation: lead.preferredLocation,
          preferredBhk: lead.preferredBhk,
          minBudget: lead.minBudget,
          maxBudget: lead.maxBudget,
          requirementType: lead.requirementType,
        }}
        currentUserId={session!.user.id}
        currentUserName={session!.user.name}
      />
    </div>
  );
}
