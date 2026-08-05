import { PropertyForm } from "@/components/properties/property-form";

export default function NewPropertyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#1B2430]">Add Property</h1>
        <p className="text-sm text-[#596579]">Add a new property to the CRM inventory.</p>
      </div>
      <PropertyForm />
    </div>
  );
}
