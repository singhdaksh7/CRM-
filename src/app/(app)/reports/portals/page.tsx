import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { prisma } from "@/lib/prisma";
import { FailedOperationsPanel } from "@/components/property-portals/failed-operations-panel";

export default async function PortalReportPage() {
  const session = await auth(); if (!session || session.user.role === "FIELD_EXECUTIVE") return null;
  const organizationId = getOrganizationId(session.user.id);
  const [providers, linkedLeadEvents, transactions, statuses, listings, failedOps] = await Promise.all([
    prisma.externalLeadEvent.groupBy({ by: ["provider"], where: { organizationId }, _count: { _all: true } }),
    prisma.externalLeadEvent.count({ where: { organizationId, leadId: { not: null } } }),
    prisma.lead.groupBy({ by: ["assetClass", "transactionType"], where: { organizationId, portalProvider: { not: null } }, _count: { _all: true } }),
    prisma.externalLeadEvent.groupBy({ by: ["ingestionStatus"], where: { organizationId }, _count: { _all: true } }),
    prisma.portalListing.groupBy({ by: ["provider", "status"], where: { organizationId }, _count: { _all: true } }),
    prisma.portalOperation.findMany({ where: { organizationId, status: { in: ["RETRYABLE", "DEAD_LETTER"] } }, select: { id: true, provider: true, operationType: true, status: true, attemptCount: true, failureReason: true, lastAttemptAt: true, retryEligibleAt: true }, take: 50, orderBy: { updatedAt: "desc" } }),
  ]);
  const total = providers.reduce((sum, row) => sum + row._count._all, 0);
  const failedOpsForPanel = failedOps.map(op => ({ ...op, lastAttemptAt: op.lastAttemptAt?.toISOString() ?? null, retryEligibleAt: op.retryEligibleAt?.toISOString() ?? null }));
  const canRetry = ["ADMIN", "DATA_MANAGER"].includes(session.user.role);
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Portal analytics</h1><p className="text-sm text-[#596579]">Authorized portal intake and operational health. No spend data is available, so ROI is not calculated.</p></div><section className="grid gap-4 md:grid-cols-2"><Card title="Leads by provider">{providers.map(row => <p key={row.provider}>{row.provider.replaceAll("_", " ")}: <b>{row._count._all}</b> · conversion: Insufficient data</p>)}</Card><Card title="Lead resolution">{statuses.map(row => <p key={row.ingestionStatus}>{row.ingestionStatus.replaceAll("_", " ")}: <b>{row._count._all}</b></p>)}</Card><Card title="Residential / commercial · rent / sale">{transactions.map(row => <p key={`${row.assetClass}${row.transactionType}`}>{row.assetClass} {row.transactionType}: <b>{row._count._all}</b></p>)}</Card><Card title="Portal-linked lead events"><p><b>{linkedLeadEvents}</b> linked lead events out of {total} received.</p><p className="mt-2 text-xs text-[#596579]">Visits and deals inherit lead provenance; conversion is shown as insufficient until a provider-attributed closed-won denominator is available.</p></Card></section><Card title="Listing status by provider">{listings.map(row => <p key={`${row.provider}${row.status}`}>{row.provider.replaceAll("_", " ")} · {row.status.replaceAll("_", " ")}: <b>{row._count._all}</b></p>)}</Card><Card title="Failed listing operations"><FailedOperationsPanel operations={failedOpsForPanel} canRetry={canRetry} /></Card></div>;
}
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-[#E7ECF2] bg-white p-5"><h2 className="mb-3 font-semibold">{title}</h2><div className="space-y-1 text-sm">{children}</div></section>; }
