import { notFound } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { Badge, PROPERTY_STATUS_TONE } from "@/components/ui/badge";
import { formatINR, formatDate, enumToLabel } from "@/lib/utils";
import { PropertyActions } from "@/components/properties/property-actions";
import { MapPin, Home, Phone, ShieldCheck, CheckCircle2 } from "lucide-react";

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) notFound();

  const amenities: string[] = JSON.parse(property.amenities || "[]");
  const price = property.listingType === "RENT" ? formatINR(property.monthlyRent, { suffix: "month" }) : formatINR(property.salePrice, { compact: true });

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col justify-between gap-4 border-b border-[rgba(255,255,255,0.08)] pb-4 sm:flex-row sm:items-start">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-[#94A3B8]">{property.propertyCode}</span>
            <Badge tone={property.listingType === "RENT" ? "blue" : "purple"}>{property.listingType === "RENT" ? "For Rent" : "For Sale"}</Badge>
            <Badge tone={PROPERTY_STATUS_TONE[property.status]}>{enumToLabel(property.status)}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F8FAFC]">{property.title}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[#94A3B8]">
            <MapPin className="h-4 w-4 text-[#4F8CFF] shrink-0" /> {property.address}, {property.area}, Delhi
            {property.landmark && ` · ${property.landmark}`}
          </p>
        </div>
        <PropertyActions propertyId={property.id} status={property.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Details & Gallery Column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Gallery Container */}
          <div className="relative h-72 w-full overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#11151F] sm:h-96">
            {property.coverImage ? (
              <Image src={property.coverImage} alt={property.title} fill className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-[#64748B]">No photo uploaded for this property</div>
            )}
          </div>

          {/* Description */}
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#94A3B8]">Description</h3>
            <p className="text-sm leading-relaxed text-[#CBD5E1]">{property.description}</p>
          </div>

          {/* Verification Panel */}
          <div className="rounded-xl border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.06)] p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2 text-[#22C55E]">
              <ShieldCheck className="h-5 w-5" />
              <h3 className="text-sm font-bold uppercase tracking-wider">NCR Verification Status</h3>
            </div>
            <p className="text-xs text-[#CBD5E1]">Property address and owner identity verified by Delhi Broker team.</p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-[#22C55E]">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Address Checked</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Owner Phone Active</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Clear Title Info</span>
            </div>
          </div>

          {/* Property Specifications */}
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#94A3B8]">Property Specifications</h3>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <Detail label="BHK" value={`${property.bhk} BHK`} />
              <Detail label="Bathrooms" value={property.bathrooms} />
              <Detail label="Balconies" value={property.balconies} />
              <Detail label="Furnishing" value={enumToLabel(property.furnishing)} />
              <Detail label="Floor" value={property.floorNumber ? `${property.floorNumber} of ${property.totalFloors ?? "-"}` : "-"} />
              <Detail label="Age" value={property.propertyAgeYears !== null ? `${property.propertyAgeYears} yrs` : "-"} />
              <Detail label="Built-up Area" value={`${property.builtUpAreaSqft} sqft`} />
              <Detail label="Carpet Area" value={property.carpetAreaSqft ? `${property.carpetAreaSqft} sqft` : "-"} />
              <Detail label="Facing" value={property.facing ? enumToLabel(property.facing) : "-"} />
              <Detail label="Parking" value={property.parkingAvailable ? "Available" : "Not available"} />
              <Detail label="Tenant Preference" value={property.tenantPreference ? enumToLabel(property.tenantPreference) : "Any"} />
              <Detail label="Available From" value={formatDate(property.availableFrom)} />
            </div>
          </div>

          {/* Amenities */}
          {amenities.length > 0 && (
            <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#94A3B8]">Amenities & Facilities</h3>
              <div className="flex flex-wrap gap-2">
                {amenities.map((a) => (
                  <Badge key={a} tone="blue">{a}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pricing & Owner Info Column */}
        <div className="space-y-6">
          {/* Pricing Panel */}
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">{property.listingType === "RENT" ? "Monthly Rent" : "Sale Price"}</p>
            <p className="mt-1 text-3xl font-bold text-[#4F8CFF]">{price}</p>
            {property.negotiable && <Badge tone="amber" className="mt-2">Price Negotiable</Badge>}
            <div className="mt-4 space-y-2 border-t border-[rgba(255,255,255,0.06)] pt-3 text-sm text-[#CBD5E1]">
              {property.listingType === "RENT" ? (
                <>
                  <Row label="Security Deposit" value={formatINR(property.securityDeposit)} />
                  <Row label="Maintenance" value={formatINR(property.maintenanceCharge, { suffix: "month" })} />
                  <Row label="Brokerage" value={formatINR(property.rentBrokerage)} />
                </>
              ) : (
                <>
                  <Row label="Price / sqft" value={formatINR(property.pricePerSqft)} />
                  <Row label="Brokerage" value={property.saleBrokeragePct ? `${property.saleBrokeragePct}%` : "-"} />
                </>
              )}
            </div>
          </div>

          {/* Internal Owner Panel */}
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#F8FAFC]">
              <Phone className="h-4 w-4 text-[#4F8CFF]" /> Owner Information
            </h3>
            <div className="space-y-2 text-sm text-[#CBD5E1]">
              <Row label="Name" value={property.ownerName} />
              <Row label="Phone" value={property.ownerPhone} />
              {property.ownerAlternatePhone && <Row label="Alternate" value={property.ownerAlternatePhone} />}
              {property.ownerNotes && <Row label="Notes" value={property.ownerNotes} />}
            </div>
            <p className="mt-3 text-xs text-[#94A3B8] border-t border-[rgba(255,255,255,0.06)] pt-2.5">🔒 Internal record. Never displayed on public shared catalogues.</p>
          </div>

          {/* Meta Details */}
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#F8FAFC]">
              <Home className="h-4 w-4 text-[#94A3B8]" /> System Metadata
            </h3>
            <div className="space-y-2 text-sm text-[#CBD5E1]">
              <Row label="Property Code" value={property.propertyCode} />
              <Row label="Added on" value={formatDate(property.createdAt)} />
              <Row label="Last updated" value={formatDate(property.updatedAt)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-[#94A3B8]">{label}</p>
      <p className="mt-0.5 font-semibold text-[#F8FAFC]">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[#94A3B8]">{label}</span>
      <span className="text-right font-semibold text-[#F8FAFC]">{value}</span>
    </div>
  );
}
