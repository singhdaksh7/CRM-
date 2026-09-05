"use client";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { RecommendationTier, RequirementLifecycleStatus, MatchHistoryStatus } from "@/lib/demand-pool/types";
import { tierTone } from "@/lib/demand-pool/format";

// Feature 2 (daily-ops hardening) - compact match-history context. "NEW" is
// intentionally not rendered (no badge = fresh match, the common case; only
// the exceptions get a badge, so the panel stays uncluttered).
const MATCH_HISTORY_TONE: Record<Exclude<MatchHistoryStatus, "NEW">, BadgeTone> = {
  LIKED: "green",
  ALREADY_SHARED: "blue",
  VISITED: "purple",
  REJECTED: "red",
};
const MATCH_HISTORY_LABEL: Record<Exclude<MatchHistoryStatus, "NEW">, string> = {
  LIKED: "Liked before",
  ALREADY_SHARED: "Already shared",
  VISITED: "Visited",
  REJECTED: "Not interested",
};

export function MatchHistoryBadge({ status }: { status?: MatchHistoryStatus }) {
  if (!status || status === "NEW") return null;
  return (
    <span aria-label={`Match history: ${MATCH_HISTORY_LABEL[status]}`}>
      <Badge tone={MATCH_HISTORY_TONE[status]}>{MATCH_HISTORY_LABEL[status]}</Badge>
    </span>
  );
}

const LIFECYCLE_TONE: Record<RequirementLifecycleStatus, BadgeTone> = {
  ACTIVE: "green",
  STALE: "amber",
  INACTIVE: "slate",
};

export function MatchTierBadge({ tier }: { tier: RecommendationTier }) {
  return (
    <span aria-label={`Match tier ${tier}`}>
      <Badge tone={tierTone(tier)}>{tier}</Badge>
    </span>
  );
}

export function RequirementLifecycleBadge({ status }: { status: RequirementLifecycleStatus }) {
  return (
    <span aria-label={`Requirement ${status.toLowerCase()}`}>
      <Badge tone={LIFECYCLE_TONE[status]}>{status}</Badge>
    </span>
  );
}

export function AssetClassBadge({ assetClass }: { assetClass: "RESIDENTIAL" | "COMMERCIAL" }) {
  const label = assetClass === "RESIDENTIAL" ? "Residential" : "Commercial";
  return <Badge tone={assetClass === "RESIDENTIAL" ? "blue" : "purple"}>{label}</Badge>;
}

export function TransactionBadge({ transactionType }: { transactionType: "RENT" | "SALE" }) {
  const label = transactionType === "RENT" ? "Rent" : "Sale";
  return <Badge tone={transactionType === "RENT" ? "indigo" : "orange"}>{label}</Badge>;
}
