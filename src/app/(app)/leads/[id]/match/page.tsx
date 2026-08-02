import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MatchWorkspace } from "@/components/leads/match-workspace";

export default async function LeadMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Property Matching &amp; Sharing</h1>
        <p className="text-sm text-slate-500">For {lead.clientName} &middot; {lead.preferredLocation} &middot; {lead.requirementType === "RENT" ? "Rent" : "Buy"}</p>
      </div>
      <MatchWorkspace lead={lead} />
    </div>
  );
}
