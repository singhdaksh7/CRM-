"use client";

import { CheckCircle2, AlertTriangle } from "lucide-react";
import { MatchTierBadge } from "./badges";
import { parseMatchReasons } from "@/lib/demand-pool/format";
import type { DemandMatchReason, RecommendationTier } from "@/lib/demand-pool/types";
import { cn } from "@/lib/utils";

export function MatchExplanation({
  tier,
  score,
  reasons,
  className,
}: {
  tier: RecommendationTier;
  score: number;
  reasons: string | DemandMatchReason[];
  className?: string;
}) {
  const items = parseMatchReasons(reasons);
  return (
    <div className={cn("space-y-2 rounded-xl border border-[#E7ECF2] bg-white p-3", className)} aria-label={`${tier} match ${score} percent`}>
      <div className="flex flex-wrap items-center gap-2">
        <MatchTierBadge tier={tier} />
        <span className="text-sm font-semibold text-[#1B2430]">
          {tier === "EXACT" ? "Exact Match" : tier === "STRONG" ? "Strong Match" : tier === "STRETCH" ? "Stretch Match" : "Low Match"} — {score}%
        </span>
        <span className="sr-only">Match score {score} out of 100</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-[#8A94A6]">No explanation details returned by the matcher.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="flex items-start gap-2 text-xs text-[#596579]">
              {item.matched ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1FA971]" aria-hidden />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E6A23C]" aria-hidden />
              )}
              <span>
                <span className="sr-only">{item.matched ? "Matched: " : "Warning: "}</span>
                {item.detail || item.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
