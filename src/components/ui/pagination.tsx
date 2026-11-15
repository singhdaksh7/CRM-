import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageSizeSelect } from "./page-size-select";

/** Default list-page size across Properties, Leads, Employees, Visits, Follow-ups, Notifications. */
export const DEFAULT_PAGE_SIZE = 25;
export const PROPERTY_PAGE_SIZE_OPTIONS = [10, 20, 30] as const;
export type PropertyPageSize = (typeof PROPERTY_PAGE_SIZE_OPTIONS)[number];

export function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function parsePageSize(value: string | undefined, defaultSize: number = 10, allowedSizes: readonly number[] = PROPERTY_PAGE_SIZE_OPTIONS): number {
  const n = Number(value);
  if (Number.isFinite(n) && allowedSizes.includes(n)) {
    return n;
  }
  return defaultSize;
}

/** Builds an href for a given page, preserving every other current query param. */
export function pageHref(basePath: string, currentParams: Record<string, string | undefined>, page: number, pageSize?: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(currentParams)) {
    if (key === "page" || key === "cursor" || value === undefined) continue;
    params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  if (pageSize && pageSize !== 10) params.set("pageSize", String(pageSize));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Generates a list of page numbers and ellipsis tokens for pagination controls. */
export function getPaginationRange(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

export function Pagination({
  basePath,
  currentParams,
  page,
  pageSize,
  totalCount,
  showPageNumbers = false,
  pageSizeOptions,
}: {
  basePath: string;
  currentParams: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  totalCount: number;
  showPageNumbers?: boolean;
  pageSizeOptions?: readonly number[];
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalCount === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  const pages = showPageNumbers ? getPaginationRange(page, totalPages) : null;

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-[#E4E4E7] px-4 py-3 text-sm sm:flex-row bg-white">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-[#71717A]">
          Showing <span className="font-semibold text-[#09090B]">{from}–{to}</span> of{" "}
          <span className="font-semibold text-[#09090B]">{totalCount}</span> properties
        </p>
        {pageSizeOptions && pageSizeOptions.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-[#71717A]">
            <span>Show:</span>
            <PageSizeSelect
              options={pageSizeOptions}
              value={pageSize}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <PageLink href={pageHref(basePath, currentParams, page - 1)} disabled={page <= 1} label="Previous">
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </PageLink>

        {showPageNumbers && pages ? (
          <div className="flex items-center gap-1">
            {pages.map((p, idx) => {
              if (p === "...") {
                return (
                  <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs text-[#A1A1AA] select-none">
                    ...
                  </span>
                );
              }
              const isCurrent = p === page;
              return (
                <Link
                  key={p}
                  href={pageHref(basePath, currentParams, p)}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors ${
                    isCurrent
                      ? "bg-[#09090B] text-white font-semibold shadow-2xs"
                      : "border border-[#E4E4E7] bg-white text-[#09090B] hover:bg-[#F4F4F5] hover:border-[#D4D4D8]"
                  }`}
                >
                  {p}
                </Link>
              );
            })}
          </div>
        ) : (
          <span className="text-xs text-[#71717A] px-1">
            Page {page} of {totalPages}
          </span>
        )}

        <PageLink href={pageHref(basePath, currentParams, page + 1)} disabled={page >= totalPages} label="Next">
          Next <ChevronRight className="h-3.5 w-3.5" />
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span aria-disabled className="flex cursor-not-allowed items-center gap-1 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-2.5 py-1.5 text-xs font-medium text-[#A1A1AA]">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex items-center gap-1 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs font-medium text-[#09090B] hover:bg-[#F4F4F5] hover:border-[#D4D4D8] transition-colors"
    >
      {children}
    </Link>
  );
}
