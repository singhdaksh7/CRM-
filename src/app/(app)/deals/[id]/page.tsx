import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { DealActions } from "@/components/deals/deal-actions";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const commercial = session!.user.role !== "FIELD_EXECUTIVE";
  const deal = await prisma.deal.findFirst({
    where: {
      id,
      organizationId: getOrganizationId(session!.user),
      ...(session!.user.role === "FIELD_EXECUTIVE" ? { assignedToId: session!.user.id } : {}),
    },
    include: {
      lead: true,
      property: { include: { partner: true } },
      owner: true,
      assignedTo: true,
      offers: { include: { createdBy: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
      brokerageCalculations: commercial,
    },
  });

  if (!deal) notFound();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          {deal.dealCode} · {deal.lead?.clientName}
        </h1>
        <p className="text-sm text-zinc-500">
          {deal.property?.title} · {deal.property?.inventorySource}
          {deal.property?.partner ? ` · ${deal.property.partner.name}` : ""}
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
          <h2 className="text-base font-semibold text-zinc-900">Negotiation</h2>
          <p className="mt-2 text-sm text-zinc-700">
            Current stage: <b className="font-semibold text-zinc-900">{deal.stage}</b>
          </p>
          <p className="text-sm text-zinc-700">
            Next follow-up: {deal.lead?.nextFollowUpAt?.toLocaleDateString() ?? "Not scheduled"}
          </p>
          {deal.status === "LOST" && (
            <p className="mt-2 text-sm font-medium text-red-700">
              Lost: {deal.lostReasonCategory} — {deal.lostReason}
            </p>
          )}
        </div>

        {commercial && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
            <h2 className="text-base font-semibold text-zinc-900">Internal commercial terms</h2>
            <p className="mt-2 text-sm text-zinc-700">
              Expected brokerage: ₹{deal.expectedBrokerageAmount?.toLocaleString("en-IN") ?? "—"}
            </p>
            <p className="text-sm text-zinc-700">
              KP share: {deal.kpSharePct ?? "—"}% · Partner share: {deal.partnerSharePct ?? "—"}%
            </p>
          </div>
        )}
      </section>

      <DealActions
        dealId={deal.id}
        indirect={deal.property?.inventorySource === "INDIRECT"}
        canManage={commercial}
      />

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
        <h2 className="text-base font-semibold text-zinc-900">Offer / Counter-offer history</h2>
        <ol className="mt-3 space-y-3">
          {deal.offers.map((o) => (
            <li key={o.id} className="border-l-2 border-zinc-900 pl-3">
              <div className="text-sm text-zinc-900">
                <b className="font-semibold">{o.side}</b> · ₹{o.amount.toLocaleString("en-IN")}{" "}
                <span className="text-xs text-zinc-500">
                  {o.createdAt.toLocaleString()} by {o.createdBy.name}
                </span>
              </div>
              {commercial && o.note && <div className="mt-1 text-xs text-zinc-600">{o.note}</div>}
            </li>
          ))}
          {deal.offers.length === 0 && <p className="text-sm text-zinc-500">No offers recorded yet.</p>}
        </ol>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
        <h2 className="text-base font-semibold text-zinc-900">Timeline</h2>
        <div className="mt-3 space-y-2">
          {deal.activities.map((a) => (
            <p key={a.id} className="text-sm text-zinc-600">
              <span className="font-medium text-zinc-900">{a.createdAt.toLocaleString()}</span> — {a.description}
            </p>
          ))}
          {deal.activities.length === 0 && <p className="text-sm text-zinc-500">No timeline activities recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}
