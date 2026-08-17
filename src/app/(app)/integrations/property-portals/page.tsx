import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { Badge } from "@/components/ui/badge";
import { propertyPortalRegistry, PROPERTY_PORTAL_PROVIDERS } from "@/integrations/property-portals/registry";

export default async function PropertyPortalsPage() {
  const session = await auth();
  const organizationId = getOrganizationId(session!.user.id);
  const connections = await prisma.propertyPortalConnection.findMany({ where: { organizationId }, select: { provider: true, status: true, connectionMode: true, displayName: true, lastSyncAt: true, lastSuccessfulSyncAt: true, lastErrorSummary: true } });
  const byProvider = new Map(connections.map((connection) => [connection.provider, connection]));
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-[#1B2430]">Property Portals</h1><p className="mt-1 text-sm text-[#596579]">Organization-scoped, contract-only connections. Credentials and raw provider responses are never shown here.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{PROPERTY_PORTAL_PROVIDERS.map((provider) => { const connection = byProvider.get(provider); const capability = propertyPortalRegistry[provider]; return <section key={provider} className="rounded-2xl border border-[#E7ECF2] bg-white p-5"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{provider.replaceAll("_", " ")}</h2><Badge tone={connection?.status === "DEGRADED" || connection?.status === "AUTH_FAILED" ? "red" : "blue"}>{(connection?.status ?? "NOT_CONFIGURED").replaceAll("_", " ")}</Badge></div><p className="mt-2 text-sm text-[#596579]">{connection ? `${connection.displayName ?? "Connection"} · ${connection.connectionMode}` : "No authorized connection configured"}</p><dl className="mt-4 space-y-1.5 text-xs text-[#596579]"><div>Lead ingestion: {capability.supportsLeadWebhook.replaceAll("_", " ")}</div><div>Publishing: {capability.supportsListingPublish.replaceAll("_", " ")}</div><div>Residential: {capability.supportsResidential.replaceAll("_", " ")}</div><div>Commercial: {capability.supportsCommercial.replaceAll("_", " ")}</div><div>Rent / sale: {capability.supportsRent.replaceAll("_", " ")} / {capability.supportsSale.replaceAll("_", " ")}</div>{connection?.lastSyncAt && <div>Last sync: {connection.lastSyncAt.toLocaleString("en-IN")}</div>}{connection?.lastErrorSummary && <div className="text-red-700">Last error: {connection.lastErrorSummary}</div>}</dl></section>; })}</div></div>;
}
