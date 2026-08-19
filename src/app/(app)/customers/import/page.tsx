import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CustomerImportWizard } from "@/components/customers/customer-import-wizard";
import { canImportCustomers } from "@/lib/demand-pool/permissions";

export default async function CustomersImportPage() {
  const session = await auth();
  if (!session?.user || !canImportCustomers(session.user.role)) redirect("/customers");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#1B2430]">Import Customers</h1>
        <p className="text-sm text-[#596579]">
          Upload → map → preview → validate → duplicates → confirm. No contact or requirement is written before confirmation.
        </p>
      </div>
      <CustomerImportWizard />
    </div>
  );
}
