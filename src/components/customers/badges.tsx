"use client";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { RecommendationTier, RequirementLifecycleStatus } from "@/lib/demand-pool/types";
import { tierTone } from "@/lib/demand-pool/format";

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
  return <Badge tone={assetClass === "RESIDENTIAL" ? "blue" : "purple"}>{assetClass}</Badge>;
}

export function TransactionBadge({ transactionType }: { transactionType: "RENT" | "SALE" }) {
  return <Badge tone={transactionType === "RENT" ? "indigo" : "orange"}>{transactionType}</Badge>;
}
