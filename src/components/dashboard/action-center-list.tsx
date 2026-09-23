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

type SerializedRuleResult = Omit<RuleResult, "generatedAt"> & { generatedAt: string };

export function ActionCenterList({ items }: { items: SerializedRuleResult[] }) {
  const [filter, setFilter] = useState<FilterKey>("All");

  const filtered = useMemo(() => {
    const active = FILTERS.find((f) => f.key === filter);
    if (!active?.categories) return items;
    return items.filter((i) => active.categories!.includes(i.category));
  }, [items, filter]);

  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-2xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#09090B]">
            <AlertTriangle className="h-4 w-4 text-[#D97706]" /> Smart Action Center
          </h3>
          <p className="text-xs text-[#71717A]">Prioritized, explainable actions computed from your CRM data.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                filter === f.key ? "bg-[#0A0A0A] text-white shadow-2xs" : "bg-[#F4F4F5] text-[#71717A] hover:text-[#09090B] hover:bg-[#E4E4E7]"
              }`}
            >
              {f.key}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-[#71717A]">Nothing needs attention right now.</p>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 30).map((item) => (
            <Link
              key={item.id}
              href={item.actionHref ?? "#"}
              className="flex items-start justify-between gap-3 rounded-lg border border-[#E4E4E7] p-3 transition-colors hover:bg-[#FAFAFA] hover:border-[#D4D4D8]"
            >
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone={SEVERITY_TONE[item.severity]}>{item.severity}</Badge>
                  <span className="text-sm font-semibold text-[#09090B]">{item.title}</span>
                </div>
                <p className="text-xs text-[#52525B]">{item.description}</p>
                <p className="mt-0.5 text-[11px] text-[#71717A]">{item.reason}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                {item.actionLabel && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#09090B]">
                    {item.actionLabel} <ArrowRight className="h-3 w-3" />
                  </span>
                )}
                <span className="text-[11px] text-[#71717A]">{timeAgo(new Date(item.generatedAt))}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
