import { notFound } from "next/navigation";
import { Building, Phone } from "lucide-react";
import { getCatalogueByToken, toPublicCatalogueDTO, withResolvedCoverImages } from "@/lib/catalogues";
import { PublicCatalogueView } from "@/components/catalogues/public-catalogue-view";

export default async function PublicCataloguePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let catalogue;
  try {
    catalogue = await getCatalogueByToken(token);
  } catch {
    notFound();
  }

  const dto = await withResolvedCoverImages(toPublicCatalogueDTO(catalogue), catalogue.organizationId);

  return (
    <div className="min-h-screen bg-[#FAFBFC]">
      <header className="flex items-center justify-between border-b border-[#E7ECF2] bg-white px-4 py-3 sm:px-8 shadow-xs">
        <div className="flex items-center gap-2">
          {dto.brokerageLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- org-supplied external URL, not an optimizable local/known-host asset
            <img src={dto.brokerageLogoUrl} alt={dto.brokerageName} className="h-5 w-auto" />
          ) : (
            <Building className="h-5 w-5 text-[#3366FF]" />
          )}
          <span className="text-sm font-bold text-[#1B2430]">{dto.brokerageName}</span>
        </div>
        {dto.brokerageContactPhone && (
          <a href={`tel:${dto.brokerageContactPhone}`} className="flex items-center gap-1 text-xs font-semibold text-[#3366FF] hover:underline">
            <Phone className="h-3.5 w-3.5" /> Call Broker
          </a>
        )}
      </header>

      <PublicCatalogueView catalogue={dto} token={token} />
    </div>
  );
}
