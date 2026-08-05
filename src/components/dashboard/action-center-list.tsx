"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import type { RuleCategory, RuleResult, RuleSeverity } from "@/lib/rules";
import { AlertTriangle, ArrowRight } from "lucide-react";

const SEVERITY_TONE: Record<RuleSeverity, BadgeTone> = {
  CRITICAL: "red",
  HIGH: "orange",
  MEDIUM: "amber",
  LOW: "blue",
  INFO: "slate",
};

type FilterKey = "All" | "Leads" | "Properties" | "Visits" | "Follow-ups" | "Deals" | "Payments";
const FILTERS: { key: FilterKey; categories: RuleCategory[] | null }[] = [
  { key: "All", categories: null },
  { key: "Leads", categories: ["LEAD", "CATALOGUE", "EMPLOYEE"] },
  { key: "Properties", categories: ["PROPERTY"] },
  { key: "Visits", categories: ["VISIT"] },
  { key: "Follow-ups", categories: ["FOLLOW_UP"] },
  { key: "Deals", categories: ["DEAL"] },
  { key: "Payments", categories: ["PAYMENT"] },
];

/** RuleResult dates arrive as JSON strings over the wire from the /api/dashboard/actions fetch - normalized back to Date here. */
type SerializedRuleResult = Omit<RuleResult, "generatedAt"> & { generatedAt: string };

export function ActionCenterList({ items }: { items: SerializedRuleResult[] }) {
  const [filter, setFilter] = useState<FilterKey>("All");

  const filtered = useMemo(() => {
    const active = FILTERS.find((f) => f.key === filter);
    if (!active?.categories) return items;
    return items.filter((i) => active.categories!.includes(i.category));
  }, [items, filter]);

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-[#1B2430]">
            <AlertTriangle className="h-4 w-4 text-[#EA580C]" /> Smart Action Center
          </h3>
          <p className="text-xs text-[#596579]">Prioritized, explainable actions computed from your CRM data - no AI involved.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                filter === f.key ? "bg-[#3366FF] text-white" : "bg-[#F3F6FA] text-[#596579] hover:bg-[#EFF4FF]"
              }`}
            >
              {f.key}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-[#8A94A6]">Nothing needs attention right now.</p>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 30).map((item) => (
            <Link
              key={item.id}
              href={item.actionHref ?? "#"}
              className="flex items-start justify-between gap-3 rounded-xl border border-[#E7ECF2] p-3 transition-colors hover:bg-[#FAFBFC]"
            >
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone={SEVERITY_TONE[item.severity]}>{item.severity}</Badge>
                  <span className="text-sm font-semibold text-[#1B2430]">{item.title}</span>
                </div>
                <p className="text-xs text-[#596579]">{item.description}</p>
                <p className="mt-0.5 text-[11px] text-[#8A94A6]">{item.reason}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                {item.actionLabel && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#3366FF]">
                    {item.actionLabel} <ArrowRight className="h-3 w-3" />
                  </span>
                )}
                <span className="text-[11px] text-[#8A94A6]">{timeAgo(new Date(item.generatedAt))}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
