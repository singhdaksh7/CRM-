import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";

const STATUS_TONE: Record<string, "green" | "slate" | "red" | "amber"> = { ACTIVE: "green", INACTIVE: "slate", DO_NOT_CONTACT: "red", ARCHIVED: "slate" };
const TIER_TONE: Record<string, "green" | "blue" | "amber" | "slate"> = { EXACT: "green", STRONG: "blue", STRETCH: "amber", LOW: "slate" };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const organizationId = getOrganizationId(session!.user.id);

  const contact = await prisma.customerContact.findFirst({
    where: { id, organizationId },
    include: {
      requirements: { orderBy: { createdAt: "desc" }, include: { convertedLead: { select: { id: true, leadCode: true, status: true } } } },
      leads: { select: { id: true, leadCode: true, status: true, createdAt: true } },
      recommendations: { orderBy: { createdAt: "desc" }, take: 20, include: { property: { select: { id: true, title: true, area: true, propertyCode: true } } } },
    },
  });
  if (!contact) notFound();

  const canManage = session!.user.role === "ADMIN" || session!.user.role === "DATA_MANAGER";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/customers" className="text-xs font-semibold text-[#3366FF] hover:underline">&larr; Demand Pool</Link>
          <h1 className="mt-1 text-2xl font-bold text-[#1B2430]">{contact.name}</h1>
          <p className="text-sm text-[#596579]">{contact.phone}{contact.email ? ` · ${contact.email}` : ""} · Source: {contact.source.replace(/_/g, " ")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[contact.status] ?? "slate"}>{contact.status.replace(/_/g, " ")}</Badge>
          {contact.doNotContact && <Badge tone="red">Do Not Contact</Badge>}
          {contact.whatsAppOptOut && <Badge tone="amber">WhatsApp Opt-out</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-[#E7ECF2] bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#596579]">Requirements</h2>
              {canManage && <span className="text-xs text-[#96A2B3]">[Add Requirement] via API: POST /api/customers/{contact.id}/requirements</span>}
            </div>
            {contact.requirements.length === 0 && <p className="text-sm text-[#96A2B3]">No requirements yet.</p>}
            <div className="space-y-3">
              {contact.requirements.map((r) => (
                <div key={r.id} className="rounded-lg border border-[#E7ECF2] p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-[#1B2430]">
                      {r.assetClass === "COMMERCIAL" ? r.commercialPropertyType?.replace(/_/g, " ") ?? "Commercial" : `${r.bhk ?? "?"} BHK`} · {r.transactionType === "RENT" ? "Rent" : "Sale"}
                    </div>
                    <div className="flex gap-2">
                      {!r.active && <Badge tone="slate">Inactive</Badge>}
                      {r.convertedLead && <Badge tone="green">Lead {r.convertedLead.leadCode}</Badge>}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-[#596579]">
                    {JSON.parse(r.preferredLocalities || "[]").join(", ") || "Any locality"} · {r.minBudget ? formatINR(r.minBudget, { compact: true }) : "-"}–{r.maxBudget ? formatINR(r.maxBudget, { compact: true }) : "-"}
                  </p>
                  <p className="mt-1 text-xs text-[#96A2B3]">Last confirmed {new Date(r.lastConfirmedAt).toLocaleDateString("en-IN")} · Priority {r.priority}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[#E7ECF2] bg-white p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#596579]">Property Recommendations</h2>
            {contact.recommendations.length === 0 && <p className="text-sm text-[#96A2B3]">No recommendations yet - use [Find Matching Properties] on a requirement.</p>}
            <div className="space-y-2">
              {contact.recommendations.map((rec) => (
                <div key={rec.id} className="flex items-center justify-between rounded-lg border border-[#E7ECF2] p-3 text-sm">
                  <div>
                    <Link href={`/properties/${rec.property.id}`} className="font-semibold text-[#3366FF] hover:underline">{rec.property.title}</Link>
                    <p className="text-xs text-[#96A2B3]">{rec.property.area} · {rec.property.propertyCode}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={TIER_TONE[rec.tier] ?? "slate"}>{rec.tier}</Badge>
                    <span className="text-xs text-[#596579]">{rec.score}%</span>
                    <Badge tone="slate">{rec.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-[#E7ECF2] bg-white p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#596579]">Linked Leads</h2>
            {contact.leads.length === 0 && <p className="text-sm text-[#96A2B3]">Not yet converted to a Lead.</p>}
            {contact.leads.map((lead) => (
              <Link key={lead.id} href={`/leads/${lead.id}`} className="block rounded-lg border border-[#E7ECF2] p-3 text-sm hover:bg-[#F7F9FC]">
                <span className="font-semibold text-[#3366FF]">{lead.leadCode}</span>
                <span className="ml-2 text-[#96A2B3]">{lead.status}</span>
              </Link>
            ))}
          </section>

          <section className="rounded-xl border border-[#E7ECF2] bg-white p-5 text-sm text-[#596579]">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#596579]">History</h2>
            <p>Last contacted: {contact.lastContactedAt ? new Date(contact.lastContactedAt).toLocaleString("en-IN") : "Never"}</p>
            <p>Last property sent: {contact.lastPropertySentAt ? new Date(contact.lastPropertySentAt).toLocaleString("en-IN") : "Never"}</p>
            <p>Created: {new Date(contact.createdAt).toLocaleDateString("en-IN")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
