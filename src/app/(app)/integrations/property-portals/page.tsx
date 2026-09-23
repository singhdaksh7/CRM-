import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { propertyPortalRegistry, PROPERTY_PORTAL_PROVIDERS } from "@/integrations/property-portals/registry";
import { ConnectionCard } from "@/components/property-portals/connection-card";
import { getHousingWebhookUrl } from "@/integrations/housing/config";

export default async function PropertyPortalsPage() {
  const session = await auth();
  const organizationId = getOrganizationId(session!.user);
  const connections = await prisma.propertyPortalConnection.findMany({
    where: { organizationId },
    select: { provider: true, status: true, connectionMode: true, displayName: true, lastSyncAt: true, lastSuccessfulSyncAt: true, lastErrorSummary: true },
  });
  const byProvider = new Map(connections.map((connection) => [connection.provider, connection]));
  const lastHousingEvent = await prisma.externalLeadEvent.findFirst({
    where: { organizationId, provider: "HOUSING" },
    orderBy: { receivedAt: "desc" },
    select: { receivedAt: true, ingestionStatus: true },
  });
  const canImportHousingLeads = ["ADMIN", "DATA_MANAGER"].includes(session!.user.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E4E4E7] pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#09090B]">Property Portals</h1>
          <p className="mt-1 text-sm text-[#52525B]">Organization-scoped connections to property portals and lead aggregators.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/integrations/property-portals/conflicts" className="inline-flex items-center rounded-lg border border-[#E4E4E7] bg-white px-3.5 py-2 text-sm font-semibold text-[#09090B] hover:bg-[#F4F4F5] transition-colors">
            Sync conflicts →
          </Link>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PROPERTY_PORTAL_PROVIDERS.map((provider) => (
          <ConnectionCard
            key={provider}
            provider={provider}
            capabilities={propertyPortalRegistry[provider]}
            initial={byProvider.get(provider)}
            canEdit={session!.user.role === "ADMIN"}
            webhookUrl={provider === "HOUSING" ? getHousingWebhookUrl() : undefined}
            lastEvent={provider === "HOUSING" && lastHousingEvent ? { receivedAt: lastHousingEvent.receivedAt, status: lastHousingEvent.ingestionStatus } : undefined}
            housingImportHref={provider === "HOUSING" && canImportHousingLeads ? "/integrations/property-portals/housing-import" : undefined}
          />
        ))}
      </div>
    </div>
  );
}
