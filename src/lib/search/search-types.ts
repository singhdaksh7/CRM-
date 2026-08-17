/**
 * Deterministic global search - no LLM, no NLP model. A fixed set of regex/
 * keyword rules turns free text into structured filters, which then run as
 * ordinary bounded Prisma queries. See tokenizer.ts -> parser.ts -> filters.ts
 * -> entity-search.ts for the pipeline.
 */

export type SearchEntityType = "LEAD" | "PROPERTY" | "PORTAL" | "EMPLOYEE" | "VISIT" | "FOLLOW_UP" | "DOCUMENT" | "DEAL" | "PAYMENT" | "CATALOGUE" | "NOTIFICATION";

export const ALL_SEARCH_ENTITY_TYPES: SearchEntityType[] = [
  "LEAD",
  "PROPERTY",
  "PORTAL",
  "EMPLOYEE",
  "VISIT",
  "FOLLOW_UP",
  "DOCUMENT",
  "DEAL",
  "PAYMENT",
  "CATALOGUE",
  "NOTIFICATION",
];

/** A removable filter pill shown in the search UI - purely a rendering of what the parser understood. */
export interface ParsedFilterChip {
  key: string;
  label: string;
}

export interface ParsedQuery {
  raw: string;
  /** Restrict results to one entity type, or null to search everything. */
  entity: SearchEntityType | null;
  /** Leftover free-text tokens used for name/code/title `contains` matching. */
  keywords: string[];
  bhk: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  /** Free-text locality/area guess - matched with `contains`, not an exact enum. */
  locality: string | null;
  /** A recognized Lead/Property/Visit/FollowUp status enum value. */
  status: string | null;
  employeeName: string | null;
  dateFilter: "TODAY" | "OVERDUE" | null;
  missingPhotos: boolean;
  chips: ParsedFilterChip[];
}

export interface SearchResultItem {
  entity: SearchEntityType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
}

export interface SearchResponse {
  query: ParsedQuery;
  results: SearchResultItem[];
  totalCount: number;
}
