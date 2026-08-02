"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { NOTIFICATION_ICONS, notificationHref } from "./notification-meta";
import type { Notification } from "@prisma/client";

const UNREAD_COUNT_POLL_MS = 30_000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  // Starts at 0 and is filled in by the first client-side fetch below - the
  // shell (sidebar/header) renders immediately without waiting on a
  // database round trip; see (app)/layout.tsx for why the server no longer
  // computes this before render.
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadCount() {
    const res = await fetch("/api/notifications/unread-count");
    if (res.ok) {
      const data = await res.json();
      setUnreadCount(data.unreadCount);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of the unread count once the shell has already rendered
    loadCount();
    const interval = setInterval(loadCount, UNREAD_COUNT_POLL_MS);
    const onFocus = () => loadCount();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
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
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <p className="text-sm font-semibold text-slate-800">Notifications</p>
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading && <p className="p-4 text-center text-sm text-slate-400">Loading...</p>}
              {!loading && notifications?.length === 0 && <p className="p-4 text-center text-sm text-slate-400">No notifications yet.</p>}
              {notifications?.map((n) => {
                const Icon = NOTIFICATION_ICONS[n.type];
                const href = notificationHref(n);
                const content = (
                  <div className={`flex gap-2.5 border-b border-slate-50 px-3 py-2.5 last:border-0 hover:bg-slate-50 ${!n.isRead ? "bg-indigo-50/40" : ""}`}>
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-800">{n.title}</p>
                      <p className="truncate text-xs text-slate-500">{n.message}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.isRead && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          markRead(n.id);
                        }}
                        className="shrink-0 self-start text-slate-300 hover:text-emerald-600"
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
            <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-3 py-2 text-center text-xs font-medium text-indigo-600 hover:bg-slate-50">
              View all notifications
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
