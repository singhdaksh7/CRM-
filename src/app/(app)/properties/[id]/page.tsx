import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge, PROPERTY_STATUS_TONE } from "@/components/ui/badge";
import { formatINR, formatDate, enumToLabel } from "@/lib/utils";
import { PropertyActions } from "@/components/properties/property-actions";
import { PropertyGallery } from "@/components/properties/property-gallery";
import { PropertyMapPanel } from "@/components/properties/property-map-panel";
import { NearbyPropertiesPanel } from "@/components/properties/nearby-properties-panel";
import { EntityDocumentPanel } from "@/components/documents/entity-document-panel";
import { PropertyReportPanel } from "@/components/properties/property-report-panel";
import { PropertyTimelinePanel } from "@/components/properties/property-timeline-panel";
import { getPropertyTimeline } from "@/lib/property-timeline";
import { HealthCard } from "@/components/rules/health-card";
import { SuggestionList } from "@/components/rules/suggestion-list";
import { getPropertyHealth, getPropertySuggestions, getInventoryFreshness } from "@/lib/rules";
import { MapPin, Home, Phone, ShieldCheck, CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { PROPERTY_PORTAL_PROVIDERS, propertyPortalRegistry } from "@/integrations/property-portals/registry";
import { portalPayloadPreview } from "@/integrations/property-portals/listing-lifecycle";
import { DistributionPanel, type ProviderRow } from "@/components/property-portals/distribution-panel";
import { MatchedCustomersPanel } from "@/components/customers/matched-customers-panel";
import { PropertyRecommendationHistory } from "@/components/customers/property-recommendation-history";

// Change 15 - Inventory Freshness label tone, distinct from the numeric Property Health score.
const FRESHNESS_TONE: Record<string, "green" | "blue" | "amber" | "red"> = {
  FRESH: "green",
  VERIFIED: "blue",
  NEEDS_VERIFICATION: "amber",
  STALE: "red",
};

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // (app)/layout.tsx already redirects to /login when there is no session,
  // so this is always present here - resolved before the property lookup
  // so the lookup itself can be organization-scoped, not just used for
  // downstream reads/permission checks.
  // (app)/layout.tsx already redirects to /login when there is no session,
  // so this is always present here - resolved before the property lookup
  // so the lookup itself can be organization-scoped, not just used for
  // downstream reads/permission checks.
  const session = await auth();
  const organizationId = getOrganizationId(session!.user);
  const property = await prisma.property.findFirst({ where: { id, organizationId }, include: { partner: true } });
  if (!property) notFound();
  const canEditDistribution = ["ADMIN", "DATA_MANAGER"].includes(session!.user.role);

  const [health, suggestions, timelineEvents, freshness, connections, listings, operations] = await Promise.all([
    getPropertyHealth(property.id, organizationId),
    getPropertySuggestions(property.id),
    getPropertyTimeline(property.id, organizationId),
    getInventoryFreshness(property.id),
    prisma.propertyPortalConnection.findMany({ where: { organizationId } }),
    prisma.portalListing.findMany({ where: { organizationId, propertyId: property.id } }),
    prisma.portalOperation.findMany({ where: { organizationId, status: { in: ["RETRYABLE", "DEAD_LETTER"] }, portalListing: { propertyId: property.id } } }),
  ]);

  const preview = portalPayloadPreview(property);
  const distributionRows: ProviderRow[] = PROPERTY_PORTAL_PROVIDERS.map((provider) => {
    const connection = connections.find((c) => c.provider === provider) ?? null;
    const listing = listings.find((l) => l.provider === provider) ?? null;
    const caps = propertyPortalRegistry[provider];
    return {
      provider,
      capabilities: { supportsListingPublish: caps.supportsListingPublish, supportsListingUpdate: caps.supportsListingUpdate, supportsListingDeactivate: caps.supportsListingDeactivate },
      connectionStatus: connection?.status ?? null,
      listing: listing ? { id: listing.id, provider, status: listing.status, externalListingId: listing.externalListingId, externalUrl: listing.externalUrl, lastSyncedAt: listing.lastSyncedAt?.toISOString() ?? null, errorSummary: listing.errorSummary, publishedAt: listing.publishedAt?.toISOString() ?? null } : null,
      operations: operations.filter((op) => op.portalListingId === listing?.id).map((op) => ({ id: op.id, provider, portalListingId: op.portalListingId, status: op.status, attemptCount: op.attemptCount, failureReason: op.failureReason, retryEligibleAt: op.retryEligibleAt?.toISOString() ?? null })),
    };
  });

  const amenities: string[] = JSON.parse(property.amenities || "[]");
  const price = property.listingType === "RENT" ? formatINR(property.monthlyRent, { suffix: "month" }) : formatINR(property.salePrice, { compact: true });

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col justify-between gap-4 border-b border-[#E7ECF2] pb-4 sm:flex-row sm:items-start">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-[#8A94A6]">{property.propertyCode}</span>
            <Badge tone={property.listingType === "RENT" ? "blue" : "purple"}>{property.listingType === "RENT" ? "For Rent" : "For Sale"}</Badge>
            <Badge tone={PROPERTY_STATUS_TONE[property.status]}>{enumToLabel(property.status)}</Badge>
            <Badge tone={property.inventorySource === "DIRECT" ? "indigo" : "orange"}>{property.inventorySource === "DIRECT" ? "Direct" : "Indirect"}</Badge>
            {property.pendingVerification && <Badge tone="amber">Pending Verification</Badge>}
            {freshness && <Badge tone={FRESHNESS_TONE[freshness]}>{freshness.replace(/_/g, " ")}</Badge>}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">{property.title}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[#596579]">
            <MapPin className="h-4 w-4 text-[#3366FF] shrink-0" /> {property.address}, {property.area}, Delhi
            {property.landmark && ` · ${property.landmark}`}
          </p>
        </div>
        <PropertyActions propertyId={property.id} status={property.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Details & Gallery Column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Gallery */}
          <PropertyGallery propertyId={property.id} propertyTitle={property.title} legacyCoverImage={property.coverImage} />

          {session && (
            <MatchedCustomersPanel
              propertyId={property.id}
              propertyTitle={property.title}
              propertyMeta={[property.area, price].filter(Boolean).join(" · ")}
              propertyPrice={property.listingType === "RENT" ? property.monthlyRent : property.salePrice}
              role={session.user.role}
            />
          )}
          <PropertyRecommendationHistory propertyId={property.id} />

          {/* Location & Map */}
          <PropertyMapPanel
            propertyId={property.id}
            address={property.address}
            area={property.area}
            landmark={property.landmark}
            pincode={property.pincode}
            latitude={property.latitude}
            longitude={property.longitude}
            formattedAddress={property.formattedAddress}
            geocodeStatus={property.geocodeStatus}
            locationPrecision={property.locationPrecision}
            publicLocationMode={property.publicLocationMode}
          />

          {/* Description */}
          <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#8A94A6]">Description</h3>
            <p className="text-sm leading-relaxed text-[#596579]">{property.description}</p>
          </div>

          {/* Verification Panel */}
          <div className="rounded-2xl border border-[#B8F3D1] bg-[#E6F9EE] p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-2 text-[#1FA971]">
              <ShieldCheck className="h-5 w-5" />
              <h3 className="text-sm font-bold uppercase tracking-wider">NCR Verification Status</h3>
            </div>
            <p className="text-xs text-[#596579]">Property address and owner identity verified by Delhi Broker team.</p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-[#1FA971]">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Address Checked</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Owner Phone Active</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Clear Title Info</span>
            </div>
          </div>

          {/* Property Specifications */}
          <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#8A94A6]">Property Specifications</h3>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              {property.assetClass === "COMMERCIAL" ? <>
                <Detail label="Commercial Type" value={enumToLabel(property.propertyType)} />
                <Detail label="Built-up Area" value={`${property.builtUpAreaSqft} sqft`} />
                <Detail label="Carpet Area" value={property.carpetAreaSqft ? `${property.carpetAreaSqft} sqft` : "-"} />
                <Detail label="Fit-out" value={property.commercialFitOut ? enumToLabel(property.commercialFitOut) : enumToLabel(property.furnishing)} />
                <Detail label="Floor" value={property.floorNumber !== null ? `${property.floorNumber} of ${property.totalFloors ?? "-"}` : "-"} />
                <Detail label="Workstations" value={property.workstations ?? "-"} />
                <Detail label="Cabins" value={property.cabins ?? "-"} />
                <Detail label="Parking" value={property.parkingAvailable ? "Available" : "Not available"} />
                <Detail label="Lift / Goods lift" value={`${property.liftAvailable ? "Yes" : "No"} / ${property.goodsLiftAvailable ? "Yes" : "No"}`} />
                <Detail label="Available From" value={formatDate(property.availableFrom)} />
              </> : <>
                <Detail label="BHK" value={`${property.bhk} BHK`} /><Detail label="Bathrooms" value={property.bathrooms} /><Detail label="Balconies" value={property.balconies} /><Detail label="Furnishing" value={enumToLabel(property.furnishing)} /><Detail label="Floor" value={property.floorNumber ? `${property.floorNumber} of ${property.totalFloors ?? "-"}` : "-"} /><Detail label="Age" value={property.propertyAgeYears !== null ? `${property.propertyAgeYears} yrs` : "-"} /><Detail label="Built-up Area" value={`${property.builtUpAreaSqft} sqft`} /><Detail label="Carpet Area" value={property.carpetAreaSqft ? `${property.carpetAreaSqft} sqft` : "-"} /><Detail label="Facing" value={property.facing ? enumToLabel(property.facing) : "-"} /><Detail label="Parking" value={property.parkingAvailable ? "Available" : "Not available"} /><Detail label="Tenant Preference" value={property.tenantPreference ? enumToLabel(property.tenantPreference) : "Any"} /><Detail label="Available From" value={formatDate(property.availableFrom)} />
              </>}
            </div>
          </div>

          {/* Amenities */}
          {amenities.length > 0 && (
            <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#8A94A6]">Amenities & Facilities</h3>
              <div className="flex flex-wrap gap-2">
                {amenities.map((a) => (
                  <Badge key={a} tone="blue">{a}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Nearby properties */}
          <NearbyPropertiesPanel propertyId={property.id} />

          {/* Documents */}
          <EntityDocumentPanel entityType="PROPERTY" entityId={property.id} title="Property Documents" />

          {/* Portal distribution - CRM-side state only, no external network calls */}
          {session && session.user.role !== "FIELD_EXECUTIVE" && (
            <DistributionPanel propertyId={property.id} rows={distributionRows} preview={preview} canEdit={canEditDistribution} />
          )}
        </div>

        {/* Pricing & Owner Info Column */}
        <div className="space-y-6">
          {health && <HealthCard title="Property Health" health={health} />}
          <SuggestionList suggestions={suggestions} />

          {/* Pricing Panel */}
          <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8A94A6]">{property.listingType === "RENT" ? "Monthly Rent" : "Sale Price"}</p>
            <p className="mt-1 text-3xl font-bold text-[#3366FF]">{price}</p>
            {property.negotiable && <Badge tone="amber" className="mt-2">Price Negotiable</Badge>}
            <div className="mt-4 space-y-2 border-t border-[#EFF4FF] pt-3 text-sm text-[#596579]">
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

          {/* Objective 2 - Direct shows Owner Details, Indirect shows Inventory Partner Details */}
          {property.inventorySource === "DIRECT" ? (
            <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#1B2430]">
                <Phone className="h-4 w-4 text-[#3366FF]" /> Owner Information
              </h3>
              <div className="space-y-2 text-sm text-[#596579]">
                <Row label="Name" value={property.ownerName} />
                <Row label="Phone" value={property.ownerPhone} />
                {property.ownerAlternatePhone && <Row label="Alternate" value={property.ownerAlternatePhone} />}
                {property.ownerNotes && <Row label="Notes" value={property.ownerNotes} />}
              </div>
              <p className="mt-3 text-xs text-[#8A94A6] border-t border-[#EFF4FF] pt-2.5">🔒 Internal record. Never displayed on public shared catalogues.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#1B2430]">
                <Phone className="h-4 w-4 text-[#3366FF]" /> Inventory Partner
              </h3>
              {property.partner ? (
                <div className="space-y-2 text-sm text-[#596579]">
                  <Row label="Name" value={property.partner.name} />
                  {property.partner.company && <Row label="Company" value={property.partner.company} />}
                  <Row label="Phone" value={property.partner.phone} />
                  <Link href={`/inventory-partners/${property.partner.id}`} className="mt-2 inline-block text-xs font-semibold text-[#3366FF] hover:underline">View partner profile →</Link>
                </div>
              ) : (
                <p className="text-sm text-[#596579]">No inventory partner linked - edit this property to link one.</p>
              )}
              <p className="mt-3 text-xs text-[#8A94A6] border-t border-[#EFF4FF] pt-2.5">🔒 Internal record. Never displayed on public shared catalogues.</p>
            </div>
          )}

          {/* Objectives 7 & 10 - executive-facing issue/unavailability reporting */}
          <PropertyReportPanel propertyId={property.id} />

          {/* Objective 8 & Change 11 - complete property history + last verified */}
          <PropertyTimelinePanel
            propertyId={property.id}
            lastVerifiedAt={property.lastVerifiedAt?.toISOString() ?? null}
            events={timelineEvents.map((e) => ({
              id: e.id,
              eventType: e.eventType,
              fromValue: e.fromValue,
              toValue: e.toValue,
              note: e.note,
              createdAt: e.createdAt.toISOString(),
              actor: e.actor ? { name: e.actor.name } : null,
            }))}
          />

          {/* Meta Details */}
          <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#1B2430]">
              <Home className="h-4 w-4 text-[#8A94A6]" /> System Metadata
            </h3>
            <div className="space-y-2 text-sm text-[#596579]">
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
      <p className="text-xs font-medium text-[#8A94A6]">{label}</p>
      <p className="mt-0.5 font-semibold text-[#1B2430]">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[#8A94A6]">{label}</span>
      <span className="text-right font-semibold text-[#1B2430]">{value}</span>
    </div>
  );
}
