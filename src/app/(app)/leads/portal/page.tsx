import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { EmptyState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";

export default async function PortalLeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const params = await searchParams;
  const organizationId = getOrganizationId(session!.user.id);
  const events = await prisma.externalLeadEvent.findMany({ where: { organizationId, ...(params.provider ? { provider: params.provider as never } : {}), ...(params.status ? { ingestionStatus: params.status as never } : {}) }, include: { lead: { select: { leadCode: true, clientName: true, assignedToId: true } } }, orderBy: { receivedAt: "desc" }, take: 200 });
  const visible = session!.user.role === "FIELD_EXECUTIVE" ? events.filter((event) => event.lead?.assignedToId === session!.user.id) : events;
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-[#1B2430]">Portal Leads</h1><p className="mt-1 text-sm text-[#596579]">Authorized portal enquiries only. Raw provider payloads and credentials are never displayed.</p></div>{visible.length === 0 ? <EmptyState title="No portal leads" description="New authorized feeds will appear here for safe review and assignment." /> : <div className="overflow-x-auto rounded-2xl border border-[#E7ECF2] bg-white"><table className="w-full text-sm"><thead className="bg-[#F8FAFC] text-left text-xs text-[#596579]"><tr><th className="p-3">Provider</th><th className="p-3">External lead</th><th className="p-3">Listing</th><th className="p-3">CRM lead</th><th className="p-3">Received</th><th className="p-3">Status</th></tr></thead><tbody>{visible.map((event) => <tr className="border-t border-[#E7ECF2]" key={event.id}><td className="p-3">{event.provider.replaceAll("_", " ")}</td><td className="p-3 font-mono text-xs">{event.externalLeadId ?? "—"}</td><td className="p-3 font-mono text-xs">{event.externalListingId ?? "—"}</td><td className="p-3">{event.lead ? `${event.lead.leadCode} · ${event.lead.clientName}` : "Needs review"}</td><td className="p-3">{event.receivedAt.toLocaleString("en-IN")}</td><td className="p-3"><Badge tone={event.ingestionStatus === "FAILED" || event.ingestionStatus === "AMBIGUOUS" ? "red" : "blue"}>{event.ingestionStatus.replaceAll("_", " ")}</Badge></td></tr>)}</tbody></table></div>}</div>;
}
