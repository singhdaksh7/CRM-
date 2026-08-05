"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Menu, LogOut, X, Plus } from "lucide-react";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { Sidebar } from "./sidebar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { CommandPalette } from "@/components/search/command-palette";
import Link from "next/link";

export function Header({
  user,
}: {
  user: { name: string; role: Role };
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-[#E7ECF2] bg-white px-4 sm:px-6 shadow-xs">
        <button className="text-[#596579] hover:text-[#1B2430] lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Open menu">
          <Menu className="h-6 w-6" />
        </button>

        <div className="flex flex-1 items-center justify-end sm:justify-start">
          <CommandPalette role={user.role} />
        </div>

        {/* Quick Add Button */}
        <div className="relative">
          <button
            onClick={() => setQuickAddOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-[#3366FF] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#2952CC] transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Quick Add</span>
          </button>
          {quickAddOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-[#E7ECF2] bg-white p-1.5 shadow-lg z-40">
              <Link
                href="/properties?add=true"
                onClick={() => setQuickAddOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[#596579] hover:bg-[#F3F6FA] hover:text-[#1B2430] transition-colors"
              >
                + Add New Property
              </Link>
              <Link
                href="/leads?add=true"
                onClick={() => setQuickAddOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[#596579] hover:bg-[#F3F6FA] hover:text-[#1B2430] transition-colors"
              >
                + Add New Lead
              </Link>
              <Link
                href="/visits?add=true"
                onClick={() => setQuickAddOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[#596579] hover:bg-[#F3F6FA] hover:text-[#1B2430] transition-colors"
              >
                + Schedule Site Visit
              </Link>
            </div>
          )}
        </div>

        <NotificationBell />

        {/* User Menu */}
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[#F3F6FA] transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3366FF] text-xs font-bold text-white shadow-xs">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold text-[#1B2430] leading-tight">{user.name}</p>
              <p className="text-xs text-[#596579] leading-tight">{ROLE_LABELS[user.role]}</p>
            </div>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-[#E7ECF2] bg-white p-1.5 shadow-lg z-40">
              <div className="px-3 py-2 border-b border-[#EFF4FF] sm:hidden">
                <p className="text-sm font-semibold text-[#1B2430]">{user.name}</p>
                <p className="text-xs text-[#596579]">{ROLE_LABELS[user.role]}</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#E5484D] hover:bg-[#FFECEC] transition-colors"
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
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 h-full w-64">
            <button className="absolute right-3 top-4 text-[#596579] hover:text-[#1B2430]" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="h-6 w-6" />
            </button>
            <Sidebar role={user.role} mobile onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
