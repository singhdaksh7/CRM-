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
  tone?: "indigo" | "green" | "amber" | "red" | "blue" | "purple" | "slate";
  hint?: string;
}) {
  const toneClasses: Record<string, string> = {
    slate: "bg-[#F4F4F5] text-[#09090B] border border-[#E4E4E7]",
    blue: "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]",
    green: "bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0]",
    amber: "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]",
    red: "bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]",
    purple: "bg-[#FAF5FF] text-[#7E22CE] border border-[#E9D5FF]",
    indigo: "bg-[#EEF2FF] text-[#4338CA] border border-[#C7D2FE]",
  };
  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-2xs hover:border-[#D4D4D8] transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[#09090B]">{value}</p>
          {hint && <p className="mt-1 text-xs text-[#71717A]">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn("rounded-lg p-2 shrink-0", toneClasses[tone] ?? toneClasses.slate)}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}
