"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Menu, Search, LogOut, X, Plus } from "lucide-react";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { Sidebar } from "./sidebar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import Link from "next/link";

export function Header({
  user,
  notificationCount,
}: {
  user: { name: string; role: Role };
  notificationCount: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-[rgba(255,255,255,0.08)] bg-[#121722] px-4 sm:px-6">
        <button className="text-[#94A3B8] hover:text-[#F8FAFC] lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu className="h-6 w-6" />
        </button>

        <div className="hidden flex-1 items-center sm:flex">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <input
              type="search"
              placeholder="Search leads, properties, locality..."
              className="w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#11151F] py-2 pl-9 pr-3 text-sm text-[#F8FAFC] placeholder:text-[#64748B] focus:border-[#4F8CFF] focus:outline-none focus:ring-1 focus:ring-[#4F8CFF] transition-all"
            />
          </div>
        </div>
        <div className="flex-1 sm:hidden" />

        {/* Quick Add Button */}
        <div className="relative">
          <button
            onClick={() => setQuickAddOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-[#4F8CFF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6BA0FF] transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Quick Add</span>
          </button>
          {quickAddOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-[rgba(255,255,255,0.14)] bg-[#181E2A] p-1.5 shadow-xl z-40">
              <Link
                href="/properties?add=true"
                onClick={() => setQuickAddOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-[#252D3D] hover:text-white transition-colors"
              >
                + Add New Property
              </Link>
              <Link
                href="/leads?add=true"
                onClick={() => setQuickAddOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-[#252D3D] hover:text-white transition-colors"
              >
                + Add New Lead
              </Link>
              <Link
                href="/visits?add=true"
                onClick={() => setQuickAddOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-[#252D3D] hover:text-white transition-colors"
              >
                + Schedule Site Visit
              </Link>
            </div>
          )}
        </div>

        <NotificationBell initialUnreadCount={notificationCount} />

        {/* User Menu */}
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[#1E2533] transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4F8CFF] text-xs font-bold text-white shadow-sm">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold text-[#F8FAFC] leading-tight">{user.name}</p>
              <p className="text-xs text-[#94A3B8] leading-tight">{ROLE_LABELS[user.role]}</p>
            </div>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-[rgba(255,255,255,0.14)] bg-[#181E2A] p-1.5 shadow-xl z-40">
              <div className="px-3 py-2 border-b border-[rgba(255,255,255,0.08)] sm:hidden">
                <p className="text-sm font-semibold text-[#F8FAFC]">{user.name}</p>
                <p className="text-xs text-[#94A3B8]">{ROLE_LABELS[user.role]}</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[#EF4444] hover:bg-[rgba(239,68,68,0.12)] transition-colors"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 h-full w-64">
            <button className="absolute right-3 top-4 text-[#94A3B8] hover:text-white" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="h-6 w-6" />
            </button>
            <Sidebar role={user.role} mobile onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
