import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCatalogueById } from "@/lib/catalogues";
import { toExecutiveCatalogueDTO } from "@/lib/catalogue-dto";
import { assertLeadAccessible } from "@/lib/lead-access";
import { getOrganizationId } from "@/lib/organization";
import { getCataloguePreferenceSummary } from "@/lib/catalogue-property-preferences";
import { getCoverImageUrls } from "@/lib/property-images";
import { Badge } from "@/components/ui/badge";
import { CataloguePropertyCard } from "@/components/executive-dashboard/catalogue-property-card";

export default async function ExecutiveCatalogueViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) notFound();

  const organizationId = getOrganizationId(session.user);
  let catalogue;
  try {
    catalogue = await getCatalogueById(id, organizationId);
    await assertLeadAccessible({ user: session.user }, catalogue.leadId);
  } catch {
    notFound();
  }

  const dto = toExecutiveCatalogueDTO(catalogue);
  const preferenceSummary = await getCataloguePreferenceSummary(id, organizationId).catch(() => null);
  const coverUrls = await getCoverImageUrls(
    dto.properties.map((p) => p.id),
    organizationId
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E7ECF2] pb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">{dto.title}</h1>
          <Badge tone="blue">v{dto.version}</Badge>
        </div>
        <p className="mt-1 text-sm text-[#596579]">For {dto.clientName} - internal view (owner/partner details, navigation, and notes visible here only)</p>
        {preferenceSummary && (
          <p className="mt-2 text-sm font-medium text-[#596579]">
            {preferenceSummary.totalProperties} properties · {preferenceSummary.likedCount} liked · {preferenceSummary.notInterestedCount} not interested · {preferenceSummary.noResponseCount} no response
          </p>
        )}
      </div>

      {dto.properties.length === 0 ? (
        <p className="text-sm text-[#596579]">No properties in this catalogue.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {dto.properties.map((p) => (
            <CataloguePropertyCard
              key={p.id}
              catalogueId={dto.id}
              property={{ ...p, coverImage: coverUrls[p.id] ?? p.coverImage }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
