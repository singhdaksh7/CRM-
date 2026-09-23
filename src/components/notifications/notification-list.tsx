"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { NOTIFICATION_ICONS, NOTIFICATION_LABELS, notificationHref } from "./notification-meta";
import { Badge } from "@/components/ui/badge";
import type { Notification } from "@prisma/client";

export function NotificationList({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();

  async function markRead(id: string) {
    const res = await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    if (res.ok) router.refresh();
    else toast.error("Failed to mark as read");
  }

  if (notifications.length === 0) {
    return <p className="p-8 text-center text-sm text-[#71717A]">No notifications in this view.</p>;
  }

  return (
    <div className="divide-y divide-[#E4E4E7]">
      {notifications.map((n) => {
        const Icon = NOTIFICATION_ICONS[n.type];
        const href = notificationHref(n);
        const inner = (
          <div className={`flex items-start gap-3.5 px-4 py-3.5 transition-colors hover:bg-[#FAFAFA] ${!n.isRead ? "bg-[#F4F4F5]/60" : ""}`}>
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-[#E4E4E7] text-[#09090B]">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[#09090B]">{n.title}</p>
                <Badge tone="slate">{NOTIFICATION_LABELS[n.type]}</Badge>
              </div>
              <p className="text-xs text-[#52525B]">{n.message}</p>
              <p className="text-[11px] text-[#71717A]">{timeAgo(n.createdAt)}</p>
            </div>
            {!n.isRead && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  markRead(n.id);
                }}
                className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[#09090B] bg-white border border-[#E4E4E7] hover:bg-[#F4F4F5] transition-colors"
              >
                <Check className="h-3.5 w-3.5" /> Mark read
              </button>
            )}
          </div>
        );
        return href ? (
          <Link key={n.id} href={href} onClick={() => !n.isRead && markRead(n.id)}>
            {inner}
          </Link>
        ) : (
          <div key={n.id}>{inner}</div>
        );
      })}
    </div>
  );
}
