import { notFound } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { formatINR, enumToLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getCoverImageUrls, getPublicOrderedImageUrls } from "@/lib/property-images";
import { getOrganizationId } from "@/lib/organization";
import { createDownloadUrl, isStorageConfigured } from "@/lib/storage";
import { Building, MapPin, BedDouble, Bath, Ruler, Phone, CalendarCheck, FileText } from "lucide-react";

/**
 * Public, unauthenticated property page for WhatsApp sharing.
 * Deliberately excludes owner name/phone/notes/KYC/private documents.
 */
export default async function PublicPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) notFound();

  const organizationId = getOrganizationId();
  let coverImage = property.coverImage;
  let gallery: string[] = [];
  let publicDocs: { id: string; fileName: string; url: string }[] = [];

  try {
    if (isStorageConfigured()) {
      const coverUrls = await getCoverImageUrls([property.id], organizationId);
      coverImage = coverUrls[property.id] ?? property.coverImage;
      gallery = await getPublicOrderedImageUrls(property.id, organizationId);
      if (coverImage && gallery[0] !== coverImage) {
        gallery = [coverImage, ...gallery.filter((u) => u !== coverImage)];
      }

      const brochures = await prisma.document.findMany({
        where: {
          propertyId: property.id,
          organizationId,
          status: "ACTIVE",
          isPublic: true,
          category: "PROPERTY_BROCHURE",
        },
        take: 5,
        orderBy: { createdAt: "desc" },
      });
      publicDocs = (
        await Promise.all(
          brochures.map(async (doc) => {
            if (!doc.storageKey) return null;
            try {
              const url = await createDownloadUrl(doc.storageKey, 300, `inline; filename="${doc.fileName.replace(/"/g, "")}"`);
              return { id: doc.id, fileName: doc.fileName, url };
            } catch {
              return null;
            }
          })
        )
      ).filter((d): d is { id: string; fileName: string; url: string } => d !== null);
    }
  } catch {
    // Storage misconfigured - still render property details with legacy cover.
  }

  const amenities: string[] = JSON.parse(property.amenities || "[]");
  const price = property.listingType === "RENT" ? formatINR(property.monthlyRent, { suffix: "month" }) : formatINR(property.salePrice, { compact: true });
  const contactPhone = "+919811100002";
  const whatsappHref = `https://wa.me/${contactPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi, I'm interested in ${property.title} (${property.propertyCode}).`)}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-8">
        <Building className="h-5 w-5 text-indigo-600" />
        <span className="text-sm font-semibold text-slate-800">KP Properties</span>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
        <div className="relative h-64 w-full overflow-hidden rounded-xl bg-slate-200 sm:h-96">
          {coverImage && <Image src={coverImage} alt={property.title} fill className="object-cover" unoptimized />}
          <div className="absolute left-3 top-3 flex gap-2">
            <Badge tone={property.listingType === "RENT" ? "blue" : "purple"}>{property.listingType === "RENT" ? "For Rent" : "For Sale"}</Badge>
          </div>
        </div>

        {gallery.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Property gallery">
            {gallery.slice(0, 12).map((url, idx) => (
              <div key={`${idx}-${url.slice(-24)}`} className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-200">
                <Image src={url} alt={`${property.title} photo ${idx + 1}`} fill sizes="80px" className="object-cover" unoptimized />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">{property.title}</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
            <MapPin className="h-4 w-4" /> {property.area}, Delhi
          </p>

          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1.5"><BedDouble className="h-4 w-4" /> {property.bhk} BHK</span>
            <span className="flex items-center gap-1.5"><Bath className="h-4 w-4" /> {property.bathrooms} Bathrooms</span>
            <span className="flex items-center gap-1.5"><Ruler className="h-4 w-4" /> {property.builtUpAreaSqft} sqft</span>
          </div>

          <div className="mt-4 rounded-lg bg-indigo-50 p-4">
            <p className="text-xs font-medium text-indigo-600">{property.listingType === "RENT" ? "Monthly Rent" : "Price"}</p>
            <p className="text-2xl font-semibold text-indigo-700">{price}</p>
            {property.negotiable && <p className="mt-1 text-xs text-indigo-500">Negotiable</p>}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <MiniDetail label="Furnishing" value={enumToLabel(property.furnishing)} />
            <MiniDetail label="Floor" value={property.floorNumber ? `${property.floorNumber} of ${property.totalFloors ?? "-"}` : "-"} />
            <MiniDetail label="Facing" value={property.facing ? enumToLabel(property.facing) : "-"} />
            <MiniDetail label="Parking" value={property.parkingAvailable ? "Yes" : "No"} />
            {property.listingType === "RENT" && <MiniDetail label="Tenant Pref." value={property.tenantPreference ? enumToLabel(property.tenantPreference) : "Any"} />}
          </div>

          {amenities.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-slate-800">Amenities</p>
              <div className="flex flex-wrap gap-2">
                {amenities.map((a) => (
                  <Badge key={a} tone="slate">{a}</Badge>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <p className="mb-1 text-sm font-semibold text-slate-800">Description</p>
            <p className="text-sm leading-relaxed text-slate-600">{property.description}</p>
          </div>

          {publicDocs.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-slate-800">Documents</p>
              <ul className="space-y-2">
                {publicDocs.map((doc) => (
                  <li key={doc.id}>
                    <a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-indigo-600 hover:underline">
                      <FileText className="h-4 w-4" /> {doc.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <a href={whatsappHref} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500">
              <Phone className="h-4 w-4" /> Contact via WhatsApp
            </a>
            <a href={whatsappHref} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
              <CalendarCheck className="h-4 w-4" /> Request a Visit
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

function MiniDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}
