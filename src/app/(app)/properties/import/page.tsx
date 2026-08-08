import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { InventoryImportWizard } from "@/components/properties/inventory-import-wizard";

export default async function InventoryImportPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "DATA_MANAGER"].includes(session.user.role)) redirect("/properties");
  return <div className="space-y-5"><div><h1 className="text-2xl font-bold">Inventory Import</h1><p className="text-sm text-slate-600">Upload → map → preview → validate → resolve duplicates → confirm. No property write occurs before confirmation.</p></div><InventoryImportWizard/></div>;
}
