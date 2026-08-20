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
  const connections = await prisma.propertyPortalConnection.findMany({ where: { organizationId }, select: { provider: true, status: true, connectionMode: true, displayName: true, lastSyncAt: true, lastSuccessfulSyncAt: true, lastErrorSummary: true } });
  const byProvider = new Map(connections.map((connection) => [connection.provider, connection]));
  const lastHousingEvent = await prisma.externalLeadEvent.findFirst({ where: { organizationId, provider: "HOUSING" }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true, ingestionStatus: true } });
  return <div className="space-y-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-[#1B2430]">Property Portals</h1><p className="mt-1 text-sm text-[#596579]">Organization-scoped, contract-only connections. Credentials and raw provider responses are never shown here.</p></div><Link href="/integrations/property-portals/conflicts" className="rounded border px-3 py-2 text-sm font-semibold text-[#3366FF]">Sync conflicts →</Link></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{PROPERTY_PORTAL_PROVIDERS.map((provider) => <ConnectionCard key={provider} provider={provider} capabilities={propertyPortalRegistry[provider]} initial={byProvider.get(provider)} canEdit={session!.user.role === "ADMIN"} webhookUrl={provider === "HOUSING" ? getHousingWebhookUrl() : undefined} lastEvent={provider === "HOUSING" && lastHousingEvent ? { receivedAt: lastHousingEvent.receivedAt, status: lastHousingEvent.ingestionStatus } : undefined} />)}</div></div>;
}
