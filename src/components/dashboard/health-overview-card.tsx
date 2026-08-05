import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { HealthLabel } from "@/lib/rules";

const LABEL_ORDER: HealthLabel[] = ["Excellent", "Healthy", "Needs Attention", "At Risk", "Critical"];
const LABEL_TONE: Record<HealthLabel, BadgeTone> = {
  Excellent: "green",
  Healthy: "green",
  "Needs Attention": "amber",
  "At Risk": "orange",
  Critical: "red",
};
const BAR_COLOR: Record<HealthLabel, string> = {
  Excellent: "#1FA971",
  Healthy: "#1FA971",
  "Needs Attention": "#E6A23C",
  "At Risk": "#EA580C",
  Critical: "#E5484D",
};

export function HealthOverviewCard({ title, distribution }: { title: string; distribution: { label: HealthLabel; count: number }[] }) {
  const total = distribution.reduce((sum, d) => sum + d.count, 0);
  const byLabel = new Map(distribution.map((d) => [d.label, d.count]));

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#1B2430]">{title}</h3>
        <span className="text-xs text-[#8A94A6]">{total} tracked</span>
      </div>
      {total === 0 ? (
        <p className="text-sm text-[#8A94A6]">No active records to score yet.</p>
      ) : (
        <div className="space-y-2.5">
          {LABEL_ORDER.map((label) => {
            const count = byLabel.get(label) ?? 0;
            if (count === 0) return null;
            const pct = Math.round((count / total) * 100);
            return (
              <div key={label} className="flex items-center gap-3">
                <Badge tone={LABEL_TONE[label]} className="w-[7.5rem] justify-center">{label}</Badge>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F3F6FA]">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: BAR_COLOR[label] }} />
                </div>
                <span className="w-10 text-right text-xs font-semibold text-[#596579]">{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
