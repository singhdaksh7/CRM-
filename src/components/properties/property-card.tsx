import Link from "next/link";
import Image from "next/image";
import type { Property } from "@prisma/client";
import { Badge, PROPERTY_STATUS_TONE } from "@/components/ui/badge";
import { formatINR, enumToLabel } from "@/lib/utils";
import { MapPin, BedDouble, Bath, Maximize2, BriefcaseBusiness, CalendarDays } from "lucide-react";

type PropertyCardModel = Pick<
  Property,
  | "id"
  | "title"
  | "area"
  | "listingType"
  | "monthlyRent"
  | "salePrice"
  | "bhk"
  | "bathrooms"
  | "builtUpAreaSqft"
  | "assetClass"
  | "propertyType"
  | "workstations"
  | "cabins"
  | "status"
  | "coverImage"
>;

export function PropertyCard({
  property,
  coverImageUrl,
  listedAt,
}: {
  property: PropertyCardModel;
  coverImageUrl?: string | null;
  listedAt?: Date | string | null;
}) {
  const price = property.listingType === "RENT" ? formatINR(property.monthlyRent, { suffix: "month" }) : formatINR(property.salePrice, { compact: true });
  const src = coverImageUrl ?? property.coverImage;
  const listedLabel = listedAt
    ? new Date(listedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="group overflow-hidden rounded-xl border border-[#E4E4E7] bg-white shadow-2xs transition-all duration-200 hover:border-[#D4D4D8]">
      <Link href={`/properties/${property.id}`} className="block">
        <div className="relative h-44 w-full bg-[#FAFAFA]">
          {src ? (
            <Image src={src} alt={property.title} fill sizes="(max-width: 768px) 100vw, 320px" className="object-cover transition-transform duration-300 group-hover:scale-102" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-[#71717A]">No photo available</div>
          )}
          <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5 z-10">
            <Badge tone={property.listingType === "RENT" ? "blue" : "purple"}>{property.listingType === "RENT" ? "For Rent" : "For Sale"}</Badge>
            <Badge tone={PROPERTY_STATUS_TONE[property.status]}>{enumToLabel(property.status)}</Badge>
          </div>
        </div>
      </Link>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold text-[#09090B] group-hover:underline transition-colors">{property.title}</p>
          <p className="shrink-0 text-sm font-bold text-[#09090B]">{price}</p>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-[#71717A]">
          <MapPin className="h-3 w-3 text-[#71717A] shrink-0" /> {property.area}, Delhi
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs text-[#52525B] border-t border-[#E4E4E7] pt-3">
          {property.assetClass === "COMMERCIAL" ? (
            <>
              <span className="flex items-center gap-1">
                <BriefcaseBusiness className="h-3.5 w-3.5 text-[#71717A]" /> {enumToLabel(property.propertyType)}
              </span>
              {property.workstations ? <span>{property.workstations} wk</span> : null}
              {property.cabins ? <span>{property.cabins} cab</span> : null}
            </>
          ) : (
            <>
              <span className="flex items-center gap-1 font-medium">
                <BedDouble className="h-3.5 w-3.5 text-[#71717A]" /> {property.bhk} BHK
              </span>
              <span className="flex items-center gap-1">
                <Bath className="h-3.5 w-3.5 text-[#71717A]" /> {property.bathrooms} Bath
              </span>
              <span className="flex items-center gap-1">
                <Maximize2 className="h-3.5 w-3.5 text-[#71717A]" /> {property.builtUpAreaSqft} sqft
              </span>
            </>
          )}
        </div>
        {listedLabel && (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-[#71717A]">
            <CalendarDays className="h-3 w-3" /> Listed {listedLabel}
          </p>
        )}
        <Link
          href={`/properties/${property.id}`}
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-[#0A0A0A] px-3 py-2 text-xs font-semibold text-white hover:bg-[#27272A] border border-[#0A0A0A] shadow-2xs transition-colors"
        >
          Open Property
        </Link>
      </div>
    </div>
  );
}
