import { cn } from "@/lib/utils";

export type BadgeTone = "slate" | "green" | "amber" | "red" | "blue" | "purple" | "indigo" | "orange" | "whatsapp";

const TONE_CLASSES: Record<BadgeTone, string> = {
  slate: "bg-[#F4F4F5] text-[#52525B] border border-[#E4E4E7]",
  green: "bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0]",
  amber: "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]",
  red: "bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]",
  blue: "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]",
  purple: "bg-[#FAF5FF] text-[#7E22CE] border border-[#E9D5FF]",
  indigo: "bg-[#EEF2FF] text-[#4338CA] border border-[#C7D2FE]",
  orange: "bg-[#FFF7ED] text-[#C2410C] border border-[#FFEDD5]",
  whatsapp: "bg-[#F0FDF4] text-[#15803D] border border-[#86EFAC]",
};

export function Badge({ tone = "slate", children, className }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium tracking-normal whitespace-nowrap", TONE_CLASSES[tone], className)}>
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
  VISIT_COMPLETED: "green",
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
  IN_PROGRESS: "orange",
  COMPLETED: "green",
  RESCHEDULED: "amber",
  CANCELLED: "red",
  CLIENT_NO_SHOW: "red",
};

/** Per-property progress inside one multi-property visit. */
export const VISIT_PROPERTY_STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: "slate",
  VISITED: "green",
  SKIPPED: "amber",
  CLIENT_REJECTED: "red",
  UNAVAILABLE: "red",
};

export const FOLLOWUP_STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: "blue",
  COMPLETED: "green",
  RESCHEDULED: "amber",
  OVERDUE: "red",
};
