import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PropertyForm } from "@/components/properties/property-form";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const property = await prisma.property.findFirst({ where: { id, organizationId: getOrganizationId(session!.user) } });
  if (!property) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#1B2430]">Edit Property</h1>
        <p className="text-sm text-[#596579]">{property.propertyCode} &middot; {property.title}</p>
      </div>
      <PropertyForm property={property} />
    </div>
  );
}
