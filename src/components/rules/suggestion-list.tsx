"use client";

import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { RuleSeverity, Suggestion } from "@/lib/rules";
import { Lightbulb } from "lucide-react";

const SEVERITY_TONE: Record<RuleSeverity, BadgeTone> = {
  CRITICAL: "red",
  HIGH: "orange",
  MEDIUM: "amber",
  LOW: "blue",
  INFO: "slate",
};

/**
 * Renders deterministic, rule-based suggestions - never "AI suggestions".
 * `onTabAction` lets a host workspace (e.g. Lead Detail's tabbed layout)
 * wire "tab"-kind suggestions to its own tab switcher; omit it and tab
 * suggestions simply render disabled with no navigation, rather than firing
 * a callback that doesn't exist.
 */
export function SuggestionList({ title, suggestions, onTabAction }: { title?: string; suggestions: Suggestion[]; onTabAction?: (target: string) => void }) {
  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#1B2430]">
          <Lightbulb className="h-4 w-4 text-[#3366FF]" /> {title ?? "Smart Suggestions"}
        </h3>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8A94A6]">Recommended action</span>
      </div>
      <div className="space-y-2">
        {suggestions.map((s) => (
          <div key={s.id} className="flex items-start justify-between gap-3 rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] p-3">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <Badge tone={SEVERITY_TONE[s.severity]}>{s.severity}</Badge>
                <span className="text-sm font-semibold text-[#1B2430]">{s.title}</span>
              </div>
              <p className="text-xs text-[#596579]">{s.reason}</p>
              {s.disabled && s.disabledReason && <p className="mt-1 text-[11px] italic text-[#8A94A6]">{s.disabledReason}</p>}
            </div>
            <SuggestionAction suggestion={s} onTabAction={onTabAction} />
          </div>
        ))}
      </div>
    </div>
  );
}

const ACTION_CLASS = "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors";
const ACTIVE_CLASS = `${ACTION_CLASS} bg-[#3366FF] text-white hover:bg-[#2952CC]`;
const DISABLED_CLASS = `${ACTION_CLASS} cursor-not-allowed bg-[#F3F6FA] text-[#8A94A6]`;

function SuggestionAction({ suggestion, onTabAction }: { suggestion: Suggestion; onTabAction?: (target: string) => void }) {
  if (suggestion.disabled) {
    return <span className={DISABLED_CLASS}>{suggestion.actionLabel}</span>;
  }
  if (suggestion.actionKind === "tel") {
    return (
      <a href={suggestion.actionTarget} className={ACTIVE_CLASS}>
        {suggestion.actionLabel}
      </a>
    );
  }
  if (suggestion.actionKind === "tab") {
    if (!onTabAction) return <span className={DISABLED_CLASS}>{suggestion.actionLabel}</span>;
    return (
      <button onClick={() => onTabAction(suggestion.actionTarget)} className={ACTIVE_CLASS}>
        {suggestion.actionLabel}
      </button>
    );
  }
  return (
    <Link href={suggestion.actionTarget} className={ACTIVE_CLASS}>
      {suggestion.actionLabel}
    </Link>
  );
}
