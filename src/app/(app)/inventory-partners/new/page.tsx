import { InventoryPartnerForm } from "@/components/inventory-partners/inventory-partner-form";

export default function NewInventoryPartnerPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="border-b border-[#E7ECF2] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">Add Inventory Partner</h1>
        <p className="mt-1 text-sm text-[#596579]">Broker, dealer, builder, or society office bringing in indirect inventory.</p>
      </div>
      <InventoryPartnerForm />
    </div>
  );
}
