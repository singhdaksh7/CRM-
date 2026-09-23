"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { demandPoolApi } from "@/lib/demand-pool/api";
import type { MatchSummary, PropertyRecommendation } from "@/lib/demand-pool/types";

/** Property-side recommendation rollup — only renders counts returned by the API. */
export function PropertyRecommendationHistory({ propertyId }: { propertyId: string }) {
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    void demandPoolApi
      .getPropertyMatches(propertyId)
      .then((data) => {
        setSummary(data.summary);
        const counts: Record<string, number> = {};
        for (const row of data.recommendations as PropertyRecommendation[]) {
          counts[row.status] = (counts[row.status] ?? 0) + 1;
        }
        setStatusCounts(counts);
      })
      .catch(() => {
        setSummary(null);
        setStatusCounts(null);
      });
  }, [propertyId]);

  if (!summary && !statusCounts) return null;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Recommendations</h3>
        <Link href={`/properties/${propertyId}/matches`} className="text-xs font-semibold text-zinc-900 hover:underline">
          View matches
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {statusCounts?.PREPARED != null && (
          <div>
            <p className="text-xs text-zinc-400">Prepared</p>
            <p className="font-semibold text-zinc-900">{statusCounts.PREPARED}</p>
          </div>
        )}
        {statusCounts?.SENT != null && (
          <div>
            <p className="text-xs text-zinc-400">Sent</p>
            <p className="font-semibold text-zinc-900">{statusCounts.SENT}</p>
          </div>
        )}
        {statusCounts &&
          Object.entries(statusCounts)
            .filter(([status]) => status === "RESPONDED")
            .map(([status, count]) => (
              <div key={status}>
                <p className="text-xs text-zinc-400">Responded</p>
                <p className="font-semibold text-zinc-900">{count}</p>
              </div>
            ))}
        {summary && (
          <div>
            <p className="text-xs text-zinc-400">Potential matches</p>
            <p className="font-semibold text-zinc-900">{summary.total}</p>
          </div>
        )}
      </div>
    </section>
  );
}
