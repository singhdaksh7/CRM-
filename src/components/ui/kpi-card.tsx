import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
  hint,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "indigo" | "green" | "amber" | "red" | "blue" | "purple";
  hint?: string;
}) {
  const toneClasses: Record<string, string> = {
    blue: "bg-[#EFF4FF] text-[#3366FF]",
    green: "bg-[#E6F7F0] text-[#1FA971]",
    amber: "bg-[#FFF6E5] text-[#E6A23C]",
    red: "bg-[#FFECEC] text-[#E5484D]",
    purple: "bg-[#F3E8FF] text-[#9333EA]",
    indigo: "bg-[#EEF2FF] text-[#4F46E5]",
  };
  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs hover:border-[#C3C5D8] transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-[#596579]">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[#1B2430]">{value}</p>
          {hint && <p className="mt-1 text-xs text-[#8A94A6]">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn("rounded-xl p-2.5", toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
