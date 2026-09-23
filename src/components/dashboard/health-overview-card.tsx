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
  Excellent: "#16A34A",
  Healthy: "#16A34A",
  "Needs Attention": "#D97706",
  "At Risk": "#EA580C",
  Critical: "#DC2626",
};

export function HealthOverviewCard({ title, distribution }: { title: string; distribution: { label: HealthLabel; count: number }[] }) {
  const total = distribution.reduce((sum, d) => sum + d.count, 0);
  const byLabel = new Map(distribution.map((d) => [d.label, d.count]));

  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-2xs">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#09090B]">{title}</h3>
        <span className="text-xs text-[#71717A]">{total} tracked</span>
      </div>
      {total === 0 ? (
        <p className="text-xs text-[#71717A]">No active records to score yet.</p>
      ) : (
        <div className="space-y-2.5">
          {LABEL_ORDER.map((label) => {
            const count = byLabel.get(label) ?? 0;
            if (count === 0) return null;
            const pct = Math.round((count / total) * 100);
            return (
              <div key={label} className="flex items-center gap-3">
                <Badge tone={LABEL_TONE[label]} className="w-[7.5rem] justify-center">{label}</Badge>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F4F4F5]">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: BAR_COLOR[label] }} />
                </div>
                <span className="w-10 text-right text-xs font-semibold text-[#09090B]">{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
