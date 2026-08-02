import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Default list-page size across Properties, Leads, Employees, Visits, Follow-ups, Notifications. */
export const DEFAULT_PAGE_SIZE = 25;

export function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Builds an href for a given page, preserving every other current query param. */
export function pageHref(basePath: string, currentParams: Record<string, string | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(currentParams)) {
    if (key === "page" || value === undefined) continue;
    params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  basePath,
  currentParams,
  page,
  pageSize,
  totalCount,
}: {
  basePath: string;
  currentParams: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  totalCount: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-[rgba(255,255,255,0.08)] px-4 py-3 text-sm sm:flex-row">
      <p className="text-xs text-[#94A3B8]">
        Showing <span className="font-semibold text-[#CBD5E1]">{from}-{to}</span> of{" "}
        <span className="font-semibold text-[#CBD5E1]">{totalCount}</span>
      </p>
      <div className="flex items-center gap-2">
        <PageLink href={pageHref(basePath, currentParams, page - 1)} disabled={page <= 1} label="Previous">
          <ChevronLeft className="h-4 w-4" /> Previous
        </PageLink>
        <span className="text-xs text-[#64748B]">
          Page {page} of {totalPages}
        </span>
        <PageLink href={pageHref(basePath, currentParams, page + 1)} disabled={page >= totalPages} label="Next">
          Next <ChevronRight className="h-4 w-4" />
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span aria-disabled className="flex cursor-not-allowed items-center gap-1 rounded-lg border border-[rgba(255,255,255,0.08)] px-2.5 py-1.5 text-xs font-medium text-[#475569]">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex items-center gap-1 rounded-lg border border-[rgba(255,255,255,0.08)] px-2.5 py-1.5 text-xs font-medium text-[#CBD5E1] hover:bg-[#1E2533] hover:text-white transition-colors"
    >
      {children}
    </Link>
  );
}
