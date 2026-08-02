import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PropertyForm } from "@/components/properties/property-form";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Edit Property</h1>
        <p className="text-sm text-slate-500">{property.propertyCode} &middot; {property.title}</p>
      </div>
      <PropertyForm property={property} />
    </div>
  );
}
