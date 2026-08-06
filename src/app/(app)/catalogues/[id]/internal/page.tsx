import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCatalogueById } from "@/lib/catalogues";
import { toExecutiveCatalogueDTO } from "@/lib/catalogue-dto";
import { assertLeadAccessible } from "@/lib/lead-access";
import { Badge } from "@/components/ui/badge";
import { CataloguePropertyCard } from "@/components/executive-dashboard/catalogue-property-card";

export default async function ExecutiveCatalogueViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) notFound();

  let catalogue;
  try {
    catalogue = await getCatalogueById(id);
    await assertLeadAccessible({ user: session.user }, catalogue.leadId);
  } catch {
    notFound();
  }

  const dto = toExecutiveCatalogueDTO(catalogue);

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E7ECF2] pb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">{dto.title}</h1>
          <Badge tone="blue">v{dto.version}</Badge>
        </div>
        <p className="mt-1 text-sm text-[#596579]">For {dto.clientName} - internal view (owner/partner details, navigation, and notes visible here only)</p>
      </div>

      {dto.properties.length === 0 ? (
        <p className="text-sm text-[#596579]">No properties in this catalogue.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {dto.properties.map((p) => (
            <CataloguePropertyCard key={p.id} catalogueId={dto.id} property={p} />
          ))}
        </div>
      )}
    </div>
  );
}
