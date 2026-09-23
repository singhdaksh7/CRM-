import { PropertyForm } from "@/components/properties/property-form";

export default async function NewPropertyPage({ searchParams }: { searchParams: Promise<{ inventorySource?: string; partnerId?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Add Property</h1>
        <p className="text-sm text-zinc-500">Add a new property to the CRM inventory.</p>
      </div>
      <PropertyForm initialInventorySource={sp.inventorySource === "INDIRECT" ? "INDIRECT" : undefined} initialPartnerId={sp.partnerId} />
    </div>
  );
}
