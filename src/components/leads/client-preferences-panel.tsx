"use client";

import Link from "next/link";
import { Heart, ThumbsDown, ExternalLink } from "lucide-react";
import { formatINR } from "@/lib/utils";

export interface PreferenceCard {
  propertyId: string;
  available: boolean;
  catalogueTitle: string;
  property: {
    id: string;
    title: string;
    area: string;
    listingType: string;
    monthlyRent: number | null;
    salePrice: number | null;
    bhk: number;
    thumbnailUrl: string | null;
  };
}

export interface CatalogueResponseSummary {
  catalogueShareId: string;
  title: string;
  totalProperties: number;
  likedCount: number;
  notInterestedCount: number;
  noResponseCount: number;
}

/**
 * Compact CLIENT PREFERENCES block for the simplified Lead workspace.
 * Data is fetched server-side and passed in - no client N+1.
 */
export function ClientPreferencesPanel({
  liked,
  notInterested,
  catalogueSummaries,
  onScheduleVisit,
}: {
  liked: PreferenceCard[];
  notInterested: PreferenceCard[];
  catalogueSummaries: CatalogueResponseSummary[];
  onScheduleVisit?: (propertyId: string) => void;
}) {
  if (liked.length === 0 && notInterested.length === 0 && catalogueSummaries.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Client Feedback</h3>

      {catalogueSummaries.length > 0 && (
        <div className="space-y-2">
          {catalogueSummaries.map((s) => (
            <div key={s.catalogueShareId} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              <p className="font-semibold text-zinc-900">{s.title}</p>
              <p>
                {s.totalProperties} properties · {s.likedCount} liked · {s.notInterestedCount} not interested · {s.noResponseCount} no response
              </p>
            </div>
          ))}
        </div>
      )}

      {liked.length > 0 && (
        <PreferenceGroup title="Liked" icon={<Heart className="h-3.5 w-3.5 text-rose-500" />} items={liked} liked onScheduleVisit={onScheduleVisit} />
      )}
      {notInterested.length > 0 && (
        <PreferenceGroup title="Not Interested" icon={<ThumbsDown className="h-3.5 w-3.5 text-zinc-400" />} items={notInterested} />
      )}
    </div>
  );
}

function PreferenceGroup({
  title,
  icon,
  items,
  liked,
  onScheduleVisit,
}: {
  title: string;
  icon: React.ReactNode;
  items: PreferenceCard[];
  liked?: boolean;
  onScheduleVisit?: (propertyId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-500">
        {icon} {title}
      </p>
      <div className="space-y-2">
        {items.map((item) => {
          const price =
            item.property.listingType === "RENT"
              ? formatINR(item.property.monthlyRent, { suffix: "month" })
              : formatINR(item.property.salePrice, { compact: true });
          return (
            <div key={`${item.catalogueTitle}-${item.propertyId}`} className="flex gap-3 rounded-xl border border-zinc-200 p-2.5">
              <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                {item.property.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.property.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-zinc-400">No photo</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-900">{item.property.title}</p>
                <p className="text-xs text-zinc-500">
                  {item.property.area} · {item.property.bhk} BHK · {price}
                </p>
                <p className="text-[11px] text-zinc-400">
                  {liked ? "Liked" : "Not interested"} from: {item.catalogueTitle}
                  {!item.available && " · Unavailable"}
                </p>
              </div>
              <div className="flex flex-col gap-2 justify-center items-end shrink-0">
                <Link href={`/properties/${item.property.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </Link>
                {liked && onScheduleVisit && item.available && (
                  <button
                    type="button"
                    onClick={() => onScheduleVisit(item.property.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0A0A0A] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-zinc-800 transition-colors shadow-xs"
                  >
                    Schedule Visit
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
