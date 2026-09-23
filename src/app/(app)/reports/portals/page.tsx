import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { prisma } from "@/lib/prisma";
import { FailedOperationsPanel } from "@/components/property-portals/failed-operations-panel";

export default async function PortalReportPage() {
  const session = await auth();
  if (!session || session.user.role === "FIELD_EXECUTIVE") return null;

  const organizationId = getOrganizationId(session.user);
  const [providers, linkedLeadEvents, transactions, statuses, listings, failedOps] = await Promise.all([
    prisma.externalLeadEvent.groupBy({ by: ["provider"], where: { organizationId }, _count: { _all: true } }),
    prisma.externalLeadEvent.count({ where: { organizationId, leadId: { not: null } } }),
    prisma.lead.groupBy({ by: ["assetClass", "transactionType"], where: { organizationId, portalProvider: { not: null } }, _count: { _all: true } }),
    prisma.externalLeadEvent.groupBy({ by: ["ingestionStatus"], where: { organizationId }, _count: { _all: true } }),
    prisma.portalListing.groupBy({ by: ["provider", "status"], where: { organizationId }, _count: { _all: true } }),
    prisma.portalOperation.findMany({
      where: { organizationId, status: { in: ["RETRYABLE", "DEAD_LETTER"] } },
      select: { id: true, provider: true, operationType: true, status: true, attemptCount: true, failureReason: true, lastAttemptAt: true, retryEligibleAt: true },
      take: 50,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const total = providers.reduce((sum, row) => sum + row._count._all, 0);
  const failedOpsForPanel = failedOps.map((op) => ({
    ...op,
    lastAttemptAt: op.lastAttemptAt?.toISOString() ?? null,
    retryEligibleAt: op.retryEligibleAt?.toISOString() ?? null,
  }));
  const canRetry = ["ADMIN", "DATA_MANAGER"].includes(session.user.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Portal analytics</h1>
        <p className="text-sm text-zinc-500">Authorized portal intake and operational health. No spend data is available, so ROI is not calculated.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <Card title="Leads by provider">
          {providers.map((row) => (
            <p key={row.provider}>
              <span className="font-medium text-zinc-900">{row.provider.replaceAll("_", " ")}</span>: <b>{row._count._all}</b> · conversion: Insufficient data
            </p>
          ))}
          {providers.length === 0 && <p className="text-sm text-zinc-500">No provider lead data recorded.</p>}
        </Card>

        <Card title="Lead resolution">
          {statuses.map((row) => (
            <p key={row.ingestionStatus}>
              <span className="font-medium text-zinc-900">{row.ingestionStatus.replaceAll("_", " ")}</span>: <b>{row._count._all}</b>
            </p>
          ))}
          {statuses.length === 0 && <p className="text-sm text-zinc-500">No lead events ingested.</p>}
        </Card>

        <Card title="Residential / commercial · rent / sale">
          {transactions.map((row) => (
            <p key={`${row.assetClass}${row.transactionType}`}>
              <span className="font-medium text-zinc-900">{row.assetClass} {row.transactionType}</span>: <b>{row._count._all}</b>
            </p>
          ))}
          {transactions.length === 0 && <p className="text-sm text-zinc-500">No transaction data recorded.</p>}
        </Card>

        <Card title="Portal-linked lead events">
          <p className="text-sm text-zinc-700">
            <b className="font-semibold text-zinc-900">{linkedLeadEvents}</b> linked lead events out of {total} received.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Visits and deals inherit lead provenance; conversion is shown as insufficient until a provider-attributed closed-won denominator is available.
          </p>
        </Card>
      </section>

      <Card title="Listing status by provider">
        {listings.map((row) => (
          <p key={`${row.provider}${row.status}`}>
            <span className="font-medium text-zinc-900">{row.provider.replaceAll("_", " ")}</span> · {row.status.replaceAll("_", " ")}: <b>{row._count._all}</b>
          </p>
        ))}
        {listings.length === 0 && <p className="text-sm text-zinc-500">No listings recorded.</p>}
      </Card>

      <Card title="Failed listing operations">
        <FailedOperationsPanel operations={failedOpsForPanel} canRetry={canRetry} />
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
      <h2 className="mb-3 text-base font-semibold text-zinc-900">{title}</h2>
      <div className="space-y-1.5 text-sm text-zinc-700">{children}</div>
    </section>
  );
}
