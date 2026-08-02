import { PropertyForm } from "@/components/properties/property-form";

export default function NewPropertyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Add Property</h1>
        <p className="text-sm text-slate-500">Add a new property to the inventory.</p>
      </div>
      <PropertyForm />
    </div>
  );
}
