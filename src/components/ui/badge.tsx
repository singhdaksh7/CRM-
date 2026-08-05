import { cn } from "@/lib/utils";

export type BadgeTone = "slate" | "green" | "amber" | "red" | "blue" | "purple" | "indigo" | "orange" | "whatsapp";

const TONE_CLASSES: Record<BadgeTone, string> = {
  slate: "bg-[#F3F6FA] text-[#596579] border border-[#E7ECF2]",
  green: "bg-[#E6F7F0] text-[#1FA971] border border-[#B3EBD3]",
  amber: "bg-[#FFF6E5] text-[#E6A23C] border border-[#FFE3B3]",
  red: "bg-[#FFECEC] text-[#E5484D] border border-[#FFC7C9]",
  blue: "bg-[#EFF4FF] text-[#3366FF] border border-[#CCE0FF]",
  purple: "bg-[#F3E8FF] text-[#9333EA] border border-[#E9D5FF]",
  indigo: "bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]",
  orange: "bg-[#FFF3EB] text-[#EA580C] border border-[#FFD8BE]",
  whatsapp: "bg-[#E6F9EE] text-[#25D366] border border-[#B8F3D1]",
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
