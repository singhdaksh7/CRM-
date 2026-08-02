import { notFound } from "next/navigation";
import { Building, Phone } from "lucide-react";
import { getCatalogueByToken, toPublicCatalogueDTO } from "@/lib/catalogues";
import { PublicCatalogueView } from "@/components/catalogues/public-catalogue-view";

/**
 * Public, unauthenticated. Never authenticate this route - see the privacy
 * rules in toPublicCatalogueDTO() and PublicCatalogueView for exactly what
 * is (and is not) rendered here.
 *
 * View recording (and the viewer-identity cookie) happens client-side via
 * POST /api/catalogues/[token]/view - Server Components cannot set cookies
 * during render, only Route Handlers can, so that endpoint owns it.
 */
export default async function PublicCataloguePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let catalogue;
  try {
    catalogue = await getCatalogueByToken(token);
  } catch {
    notFound();
  }

  const dto = toPublicCatalogueDTO(catalogue);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-8">
        <div className="flex items-center gap-2">
          <Building className="h-5 w-5 text-indigo-600" />
          <span className="text-sm font-semibold text-slate-800">{dto.brokerageName}</span>
        </div>
        <a href={`tel:${dto.brokerageContactPhone}`} className="flex items-center gap-1 text-xs font-medium text-indigo-600">
          <Phone className="h-3.5 w-3.5" /> Call
        </a>
      </header>

      <PublicCatalogueView catalogue={dto} token={token} />
    </div>
  );
}
