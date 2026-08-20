import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { InventoryPartnerForm } from "@/components/inventory-partners/inventory-partner-form";

export default async function EditInventoryPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = getOrganizationId(session?.user);

  const partner = await prisma.inventoryPartner.findFirst({ where: { id, organizationId } });
  if (!partner) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="border-b border-[#E7ECF2] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">Edit {partner.name}</h1>
      </div>
      <InventoryPartnerForm partner={partner} />
    </div>
  );
}
