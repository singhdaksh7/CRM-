import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CustomerDetailLoader } from "@/components/customers/customer-detail-loader";
import { canViewDemandPool } from "@/lib/demand-pool/permissions";

export default async function CustomerDetailPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canViewDemandPool(session.user.role)) redirect("/dashboard");
  return <CustomerDetailLoader role={session.user.role} />;
}
