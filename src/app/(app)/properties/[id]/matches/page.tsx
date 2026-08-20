import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatINR } from "@/lib/utils";
import { MatchedCustomersPanel } from "@/components/customers/matched-customers-panel";
import { getOrganizationId } from "@/lib/organization";
import { canViewDemandPool } from "@/lib/demand-pool/permissions";

export default async function PropertyMatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canViewDemandPool(session.user.role)) redirect("/dashboard");

  const { id } = await params;
  const organizationId = getOrganizationId(session.user);
  const property = await prisma.property.findFirst({ where: { id, organizationId } });
  if (!property) notFound();

  const price = property.listingType === "RENT" ? property.monthlyRent : property.salePrice;
  const meta = [
    property.area,
    property.listingType === "RENT" ? formatINR(property.monthlyRent, { suffix: "month" }) : formatINR(property.salePrice, { compact: true }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#1B2430]">Matched Customers</h1>
        <p className="text-sm text-[#596579]">
          {property.title} · {meta}
        </p>
      </div>
      <MatchedCustomersPanel
        propertyId={property.id}
        propertyTitle={property.title}
        propertyMeta={meta}
        propertyPrice={price}
        role={session.user.role}
      />
    </div>
  );
}
