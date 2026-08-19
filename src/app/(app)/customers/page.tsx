import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CustomersWorkspace } from "@/components/customers/customers-workspace";
import { canViewDemandPool } from "@/lib/demand-pool/permissions";

export default async function CustomersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canViewDemandPool(session.user.role)) redirect("/dashboard");
  return <CustomersWorkspace role={session.user.role} />;
}
