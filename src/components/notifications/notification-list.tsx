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
    return <p className="p-8 text-center text-sm text-slate-400">No notifications in this view.</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {notifications.map((n) => {
        const Icon = NOTIFICATION_ICONS[n.type];
        const href = notificationHref(n);
        const inner = (
          <div className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 ${!n.isRead ? "bg-indigo-50/40" : ""}`}>
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-slate-800">{n.title}</p>
                <Badge tone="slate">{NOTIFICATION_LABELS[n.type]}</Badge>
              </div>
              <p className="text-sm text-slate-500">{n.message}</p>
              <p className="mt-1 text-xs text-slate-400">{timeAgo(n.createdAt)}</p>
            </div>
            {!n.isRead && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  markRead(n.id);
                }}
                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
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
