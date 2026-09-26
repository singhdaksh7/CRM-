/**
 * Restrained semantic chart palette (reports/analytics only - see AGENTS
 * spec "Reports should be visually colorful"). Every other surface in the
 * CRM stays black/white/zinc; this file is deliberately the one place that
 * introduces color, so charts.tsx and report pages pull from here instead
 * of hardcoding hex values ad hoc.
 */
export const SEMANTIC_CHART_COLORS = {
  positive: "#16A34A", // won / completed / active
  pending: "#D97706", // pending / in-progress / warm
  negative: "#DC2626", // lost / overdue / cold
  informational: "#2563EB", // neutral informational series
  secondaryA: "#7C3AED", // secondary category (violet)
  secondaryB: "#0D9488", // secondary category (teal)
  neutral: "#71717A", // uncategorized / unknown
} as const;

/** Default rotation used for pies/bars with no semantic meaning per-slice. */
export const CHART_PALETTE = [
  SEMANTIC_CHART_COLORS.informational,
  SEMANTIC_CHART_COLORS.positive,
  SEMANTIC_CHART_COLORS.pending,
  SEMANTIC_CHART_COLORS.secondaryA,
  SEMANTIC_CHART_COLORS.secondaryB,
  SEMANTIC_CHART_COLORS.negative,
  "#0A0A0A",
  "#A1A1AA",
];

const POSITIVE_WORDS = ["won", "closed_won", "completed", "active", "available", "interested", "confirmed", "success", "paid"];
const NEGATIVE_WORDS = ["lost", "closed_lost", "cancelled", "canceled", "rejected", "overdue", "not_interested", "failed", "expired", "invalid"];
const PENDING_WORDS = ["pending", "in_progress", "in-progress", "warm", "negotiation", "scheduled", "reserved", "partial", "hot"];
const INFO_WORDS = ["new", "contacted", "qualified", "cold", "sale", "rent", "buy"];

/**
 * Maps a status/category label to a semantic chart color by keyword match
 * (case/underscore/space-insensitive). Falls back to a stable rotation
 * through CHART_PALETTE by index so unrecognized categories still render
 * distinct, non-black colors rather than collapsing to one color.
 */
export function semanticColorForLabel(label: string, indexFallback = 0): string {
  const key = label.trim().toLowerCase().replace(/\s+/g, "_");
  if (POSITIVE_WORDS.some((w) => key.includes(w))) return SEMANTIC_CHART_COLORS.positive;
  if (NEGATIVE_WORDS.some((w) => key.includes(w))) return SEMANTIC_CHART_COLORS.negative;
  if (PENDING_WORDS.some((w) => key.includes(w))) return SEMANTIC_CHART_COLORS.pending;
  if (INFO_WORDS.some((w) => key.includes(w))) return SEMANTIC_CHART_COLORS.informational;
  return CHART_PALETTE[indexFallback % CHART_PALETTE.length];
}

/** Convenience for building a Recharts-ready color list from labeled data. */
export function semanticColorsForData(data: { name: string }[]): string[] {
  return data.map((d, i) => semanticColorForLabel(d.name, i));
}
