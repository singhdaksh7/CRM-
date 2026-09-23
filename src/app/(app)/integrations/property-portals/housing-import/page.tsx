import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { HousingImportWizard } from "@/components/property-portals/housing-import-wizard";

export default async function HousingImportPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "DATA_MANAGER"].includes(session.user.role)) redirect("/integrations/property-portals");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Import Housing Leads</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload a Housing lead export (.csv or .xlsx) alongside the live Housing webhook - both stay active together.
          Upload → map columns → preview & validate → confirm. Nothing is written until you confirm.
        </p>
      </div>
      <HousingImportWizard />
    </div>
  );
}
