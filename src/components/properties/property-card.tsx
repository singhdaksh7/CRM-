import Link from "next/link";
import Image from "next/image";
import type { Property } from "@prisma/client";
import { Badge, PROPERTY_STATUS_TONE } from "@/components/ui/badge";
import { formatINR, enumToLabel } from "@/lib/utils";
import { MapPin, BedDouble, Bath, Maximize2 } from "lucide-react";

export function PropertyCard({ property }: { property: Property }) {
  const price = property.listingType === "RENT" ? formatINR(property.monthlyRent, { suffix: "month" }) : formatINR(property.salePrice, { compact: true });
  return (
    <Link href={`/properties/${property.id}`} className="group overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] shadow-sm transition-all duration-200 hover:border-[rgba(255,255,255,0.18)] hover:bg-[#1E2533]">
      <div className="relative h-44 w-full bg-[#11151F]">
        {property.coverImage ? (
          <Image src={property.coverImage} alt={property.title} fill sizes="(max-width: 768px) 100vw, 320px" className="object-cover transition-transform duration-300 group-hover:scale-105" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[#64748B]">No photo available</div>
        )}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5 z-10">
          <Badge tone={property.listingType === "RENT" ? "blue" : "purple"}>{property.listingType === "RENT" ? "For Rent" : "For Sale"}</Badge>
          <Badge tone={PROPERTY_STATUS_TONE[property.status]}>{enumToLabel(property.status)}</Badge>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-base font-bold text-[#F8FAFC] group-hover:text-[#4F8CFF] transition-colors">{property.title}</p>
          <p className="shrink-0 text-base font-bold text-[#4F8CFF]">{price}</p>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-[#94A3B8]">
          <MapPin className="h-3.5 w-3.5 text-[#4F8CFF] shrink-0" /> {property.area}, Delhi
        </p>
        <div className="mt-3 flex items-center gap-4 text-xs font-semibold text-[#CBD5E1] border-t border-[rgba(255,255,255,0.06)] pt-3">
          <span className="flex items-center gap-1">
            <BedDouble className="h-3.5 w-3.5 text-[#94A3B8]" /> {property.bhk} BHK
          </span>
          <span className="flex items-center gap-1">
            <Bath className="h-3.5 w-3.5 text-[#94A3B8]" /> {property.bathrooms} Bath
          </span>
          <span className="flex items-center gap-1">
            <Maximize2 className="h-3.5 w-3.5 text-[#94A3B8]" /> {property.builtUpAreaSqft} sqft
          </span>
        </div>
      </div>
    </Link>
  );
}
