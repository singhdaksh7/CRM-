import {
  UserPlus,
  UserCog,
  ArrowRightLeft,
  BellRing,
  AlertTriangle,
  CalendarClock,
  CalendarX,
  CalendarCog,
  Share2,
  MessageCircle,
  Trophy,
  Wallet,
  Users,
  Eye,
  ThumbsUp,
  ThumbsDown,
  CalendarPlus,
  HelpCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { Notification, NotificationType } from "@prisma/client";

export const NOTIFICATION_ICONS: Record<NotificationType, LucideIcon> = {
  NEW_LEAD: UserPlus,
  LEAD_ASSIGNED: UserCog,
  LEAD_TRANSFERRED: ArrowRightLeft,
  FOLLOW_UP_DUE: BellRing,
  FOLLOW_UP_OVERDUE: AlertTriangle,
  VISIT_SCHEDULED: CalendarClock,
  VISIT_RESCHEDULED: CalendarCog,
  VISIT_CANCELLED: CalendarX,
  PROPERTY_SHARED: Share2,
  CLIENT_REPLY_RECEIVED: MessageCircle,
  DEAL_WON: Trophy,
  PAYMENT_PENDING: Wallet,
  EMPLOYEE_CAPACITY_REACHED: Users,
  CATALOGUE_VIEWED: Eye,
  PROPERTY_INTERESTED: ThumbsUp,
  PROPERTY_NOT_INTERESTED: ThumbsDown,
  VISIT_REQUESTED: CalendarPlus,
  QUESTION_ASKED: HelpCircle,
  WHATSAPP_MESSAGE_FAILED: XCircle,
};

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  NEW_LEAD: "New Lead",
  LEAD_ASSIGNED: "Lead Assigned",
  LEAD_TRANSFERRED: "Lead Transferred",
  FOLLOW_UP_DUE: "Follow-up Due",
  FOLLOW_UP_OVERDUE: "Follow-up Overdue",
  VISIT_SCHEDULED: "Visit Scheduled",
  VISIT_RESCHEDULED: "Visit Rescheduled",
  VISIT_CANCELLED: "Visit Cancelled",
  PROPERTY_SHARED: "Property Shared",
  CLIENT_REPLY_RECEIVED: "Client Reply",
  DEAL_WON: "Deal Won",
  PAYMENT_PENDING: "Payment Pending",
  EMPLOYEE_CAPACITY_REACHED: "Capacity Reached",
  CATALOGUE_VIEWED: "Catalogue Viewed",
  PROPERTY_INTERESTED: "Property Interested",
  PROPERTY_NOT_INTERESTED: "Property Not Interested",
  VISIT_REQUESTED: "Visit Requested",
  QUESTION_ASKED: "Question Asked",
  WHATSAPP_MESSAGE_FAILED: "Message Failed",
};

export function notificationHref(n: Notification): string | null {
  if (n.leadId) return `/leads/${n.leadId}`;
  return null;
}
