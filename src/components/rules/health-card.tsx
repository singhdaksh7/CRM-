import { HeartPulse } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { HealthScoreResult, HealthLabel } from "@/lib/rules";

const HEALTH_LABEL_TONE: Record<HealthLabel, BadgeTone> = {
  Excellent: "green",
  Healthy: "green",
  "Needs Attention": "amber",
  "At Risk": "orange",
  Critical: "red",
};

/**
 * Renders a deterministic, rule-based health score - never labeled "AI",
 * always shown with the concrete reasons behind the number. Shared by the
 * Lead Detail and Property Detail pages.
 */
export function HealthCard({ title, health }: { title: string; health: HealthScoreResult }) {
  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#1B2430]">
          <HeartPulse className="h-4 w-4 text-[#3366FF]" /> {title}
        </h3>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8A94A6]">Smart suggestion</span>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-4xl font-extrabold text-[#1B2430]">{health.score}</p>
        <Badge tone={HEALTH_LABEL_TONE[health.label]}>{health.label}</Badge>
      </div>

      {health.recommendedAction && (
        <p className="mt-3 rounded-xl border border-[#CCE0FF] bg-[#EFF4FF] p-3 text-xs font-medium text-[#1B2430]">
          <span className="font-bold text-[#3366FF]">Recommended action: </span>
          {health.recommendedAction}
        </p>
      )}

      {health.positives.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-[#EFF4FF] pt-3">
          {health.positives.map((r, i) => (
            <div key={`p-${i}`} className="flex items-start gap-2 text-xs text-[#596579]">
              <span className="mt-0.5 text-[#1FA971]">+</span>
              <span>{r.detail}</span>
            </div>
          ))}
        </div>
      )}

      {health.warnings.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-[#EFF4FF] pt-3">
          {health.warnings.map((r, i) => (
            <div key={`w-${i}`} className="flex items-start gap-2 text-xs text-[#596579]">
              <span className="mt-0.5 text-[#E5484D]">!</span>
              <span>{r.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
