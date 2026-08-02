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
    blue: "bg-[rgba(79,140,255,0.12)] text-[#4F8CFF]",
    green: "bg-[rgba(34,197,94,0.12)] text-[#22C55E]",
    amber: "bg-[rgba(245,158,11,0.12)] text-[#F59E0B]",
    red: "bg-[rgba(239,68,68,0.12)] text-[#EF4444]",
    purple: "bg-[rgba(167,139,250,0.12)] text-[#A78BFA]",
    indigo: "bg-[rgba(99,102,241,0.12)] text-[#818CF8]",
  };
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-4 shadow-sm hover:border-[rgba(255,255,255,0.14)] transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-[#94A3B8]">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[#F8FAFC]">{value}</p>
          {hint && <p className="mt-1 text-xs text-[#94A3B8]">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn("rounded-lg p-2.5", toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
