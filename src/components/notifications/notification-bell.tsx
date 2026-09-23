"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { NOTIFICATION_ICONS, notificationHref } from "./notification-meta";
import type { Notification } from "@prisma/client";

const UNREAD_COUNT_POLL_MS = 45_000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  async function loadCount() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount);
      }
    } finally {
      inFlight.current = false;
    }
  }

  async function load() {
    setLoading(true);
    const res = await fetch("/api/notifications");
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.notifications.slice(0, 8));
      setUnreadCount(data.unreadCount);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadCount();

    let interval: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (interval) return;
      interval = setInterval(loadCount, UNREAD_COUNT_POLL_MS);
    };
    const stopPolling = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        loadCount();
        startPolling();
      }
    };
    const onFocus = () => loadCount();

    if (!document.hidden) startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads dropdown contents lazily the first time it's opened
    if (open && notifications === null) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setNotifications((prev) => prev?.map((n) => (n.id === id ? { ...n, isRead: true } : n)) ?? null);
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
    setNotifications((prev) => prev?.map((n) => ({ ...n, isRead: true })) ?? null);
    setUnreadCount(0);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#09090B] transition-colors cursor-pointer"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute 1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-[#E4E4E7] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E4E4E7] px-3.5 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#09090B]">Notifications</p>
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-medium text-[#71717A] hover:text-[#09090B] cursor-pointer transition-colors">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading && <p className="p-4 text-center text-xs text-[#71717A]">Loading...</p>}
              {!loading && notifications?.length === 0 && <p className="p-4 text-center text-xs text-[#71717A]">No notifications yet.</p>}
              {notifications?.map((n) => {
                const Icon = NOTIFICATION_ICONS[n.type] || Bell;
                const href = notificationHref(n);
                const content = (
                  <div className={`flex gap-2.5 border-b border-[#E4E4E7] px-3.5 py-2.5 last:border-0 hover:bg-[#F4F4F5] transition-colors ${!n.isRead ? "bg-[#FAFAFA]" : ""}`}>
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#09090B]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#09090B]">{n.title}</p>
                      <p className="truncate text-xs text-[#52525B]">{n.message}</p>
                      <p className="mt-0.5 text-[11px] text-[#A1A1AA]">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.isRead && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          markRead(n.id);
                        }}
                        className="shrink-0 self-start text-[#A1A1AA] hover:text-[#16A34A] cursor-pointer"
                        title="Mark read"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
                return href ? (
                  <Link key={n.id} href={href} onClick={() => !n.isRead && markRead(n.id)}>
                    {content}
                  </Link>
                ) : (
                  <div key={n.id}>{content}</div>
                );
              })}
            </div>
            <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-[#E4E4E7] px-3 py-2.5 text-center text-xs font-medium text-[#09090B] hover:bg-[#F4F4F5] transition-colors">
              View all notifications
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
