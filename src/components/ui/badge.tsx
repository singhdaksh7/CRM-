import { cn } from "@/lib/utils";

export type BadgeTone = "slate" | "green" | "amber" | "red" | "blue" | "purple" | "indigo" | "orange" | "whatsapp";

const TONE_CLASSES: Record<BadgeTone, string> = {
  slate: "bg-[#1E2533] text-[#94A3B8] border border-[rgba(255,255,255,0.08)]",
  green: "bg-[rgba(34,197,94,0.12)] text-[#22C55E] border border-[rgba(34,197,94,0.25)]",
  amber: "bg-[rgba(245,158,11,0.12)] text-[#F59E0B] border border-[rgba(245,158,11,0.25)]",
  red: "bg-[rgba(239,68,68,0.12)] text-[#EF4444] border border-[rgba(239,68,68,0.25)]",
  blue: "bg-[rgba(79,140,255,0.12)] text-[#4F8CFF] border border-[rgba(79,140,255,0.25)]",
  purple: "bg-[rgba(167,139,250,0.12)] text-[#A78BFA] border border-[rgba(167,139,250,0.25)]",
  indigo: "bg-[rgba(99,102,241,0.12)] text-[#818CF8] border border-[rgba(99,102,241,0.25)]",
  orange: "bg-[rgba(249,115,22,0.12)] text-[#FB923C] border border-[rgba(249,115,22,0.25)]",
  whatsapp: "bg-[rgba(37,211,102,0.12)] text-[#25D366] border border-[rgba(37,211,102,0.25)]",
};

export function Badge({ tone = "slate", children, className }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide whitespace-nowrap", TONE_CLASSES[tone], className)}>
      {children}
    </span>
  );
}

export const LEAD_STATUS_TONE: Record<string, BadgeTone> = {
  NEW: "blue",
  CONTACTED: "indigo",
  QUALIFIED: "purple",
  PROPERTIES_SHARED: "amber",
  VISIT_SCHEDULED: "orange",
  VISIT_COMPLETED: "orange",
  NEGOTIATION: "amber",
  CLOSED_WON: "green",
  CLOSED_LOST: "red",
  NOT_INTERESTED: "slate",
  INVALID: "slate",
};

export const LEAD_PRIORITY_TONE: Record<string, BadgeTone> = {
  HOT: "red",
  WARM: "amber",
  COLD: "blue",
};

export const PROPERTY_STATUS_TONE: Record<string, BadgeTone> = {
  AVAILABLE: "green",
  RESERVED: "amber",
  RENTED: "blue",
  SOLD: "purple",
  INACTIVE: "slate",
};

export const VISIT_STATUS_TONE: Record<string, BadgeTone> = {
  SCHEDULED: "blue",
  CONFIRMED: "indigo",
  CLIENT_REACHED: "purple",
  EMPLOYEE_REACHED: "purple",
  COMPLETED: "green",
  RESCHEDULED: "amber",
  CANCELLED: "red",
  CLIENT_NO_SHOW: "red",
};

export const FOLLOWUP_STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: "blue",
  COMPLETED: "green",
  RESCHEDULED: "amber",
  OVERDUE: "red",
};
