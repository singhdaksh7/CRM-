import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CatalogueBuilder } from "@/components/catalogues/catalogue-builder";

export default async function NewCataloguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Build Property Catalogue</h1>
        <p className="text-sm text-slate-500">For {lead.clientName} &middot; {lead.preferredLocation} &middot; {lead.requirementType === "RENT" ? "Rent" : "Buy"}</p>
      </div>
      <CatalogueBuilder lead={lead} />
    </div>
  );
}
