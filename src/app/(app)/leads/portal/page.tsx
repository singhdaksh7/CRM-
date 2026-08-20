import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { EmptyState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { PortalLeadActions } from "@/components/property-portals/portal-lead-actions";

/** leadSnapshot is a best-effort JSON summary (see ingestion.ts) - parse defensively, never throw the page over malformed/legacy data. */
function parseSnapshot(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function formatBudget(min: unknown, max: unknown): string | null {
  if (typeof min !== "number" && typeof max !== "number") return null;
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  if (typeof min === "number" && typeof max === "number") return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max) as number);
}

export default async function PortalLeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const params = await searchParams;
  const organizationId = getOrganizationId(session!.user);
  const events = await prisma.externalLeadEvent.findMany({ where: { organizationId, ...(params.provider ? { provider: params.provider as never } : {}), ...(params.status ? { ingestionStatus: params.status as never } : {}) }, include: { lead: { select: { leadCode: true, clientName: true, assignedToId: true } } }, orderBy: { receivedAt: "desc" }, take: 200 });
  const visible = session!.user.role === "FIELD_EXECUTIVE" ? events.filter((event) => event.lead?.assignedToId === session!.user.id) : events;
  const canAct = session!.user.role === "ADMIN" || session!.user.role === "DATA_MANAGER";
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-[#1B2430]">Portal Leads</h1><p className="mt-1 text-sm text-[#596579]">Authorized portal enquiries only. Raw provider payloads and credentials are never displayed.</p></div>{visible.length === 0 ? <EmptyState title="No portal leads" description="New authorized feeds will appear here for safe review and assignment." /> : <div className="overflow-x-auto rounded-2xl border border-[#E7ECF2] bg-white"><table className="w-full text-sm"><thead className="bg-[#F8FAFC] text-left text-xs text-[#596579]"><tr><th className="p-3">Provider</th><th className="p-3">Contact</th><th className="p-3">Project / Locality</th><th className="p-3">Budget</th><th className="p-3">CRM lead</th><th className="p-3">Received</th><th className="p-3">Status</th>{canAct && <th className="p-3">Action</th>}</tr></thead><tbody>{visible.map((event) => {
    const snapshot = parseSnapshot(event.leadSnapshot);
    const budget = snapshot ? formatBudget(snapshot.minBudget, snapshot.maxBudget) : null;
    return <tr className="border-t border-[#E7ECF2] align-top" key={event.id}>
      <td className="p-3">{event.provider.replaceAll("_", " ")}</td>
      <td className="p-3"><div>{(snapshot?.leadName as string) ?? "—"}</div><div className="text-xs text-[#596579]">{(snapshot?.leadPhone as string) ?? "—"}</div><div className="text-xs text-[#596579]">{(snapshot?.leadEmail as string) ?? "—"}</div></td>
      <td className="p-3"><div>{(snapshot?.projectName as string) ?? "—"}</div><div className="text-xs text-[#596579]">{[snapshot?.localityName, snapshot?.cityName].filter(Boolean).join(", ") || "—"}</div></td>
      <td className="p-3">{budget ?? "—"}</td>
      <td className="p-3">{event.lead ? `${event.lead.leadCode} · ${event.lead.clientName}` : "Needs review"}</td>
      <td className="p-3">{event.receivedAt.toLocaleString("en-IN")}</td>
      <td className="p-3"><Badge tone={event.ingestionStatus === "FAILED" || event.ingestionStatus === "AMBIGUOUS" ? "red" : "blue"}>{event.ingestionStatus.replaceAll("_", " ")}</Badge></td>
      {canAct && <td className="p-3"><PortalLeadActions eventId={event.id} status={event.ingestionStatus} alreadyLinked={Boolean(event.leadId)} /></td>}
    </tr>;
  })}</tbody></table></div>}</div>;
}
