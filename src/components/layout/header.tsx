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
  employeeDirectoryLabel,
}: {
  user: { name: string; role: Role };
  employeeDirectoryLabel: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const initials = user.name
    ? user.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join("")
    : "KP";

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-[#E4E4E7] bg-white px-4 sm:px-6 shrink-0">
        <button
          className="text-[#52525B] hover:text-[#09090B] lg:hidden cursor-pointer"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex flex-1 items-center justify-end sm:justify-start">
          <CommandPalette role={user.role} />
        </div>

        {/* Quick Add Button */}
        <div className="relative">
          <button
            onClick={() => setQuickAddOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-[#0A0A0A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#27272A] active:bg-[#18181B] transition-colors shadow-2xs cursor-pointer border border-[#0A0A0A]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Quick Add</span>
          </button>
          {quickAddOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-[#E4E4E7] bg-white p-1.5 shadow-lg z-40">
              <Link
                href="/properties?add=true"
                onClick={() => setQuickAddOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#09090B] transition-colors"
              >
                + Add New Property
              </Link>
              <Link
                href="/leads?add=true"
                onClick={() => setQuickAddOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#09090B] transition-colors"
              >
                + Add New Lead
              </Link>
              <Link
                href="/visits?add=true"
                onClick={() => setQuickAddOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#09090B] transition-colors"
              >
                + Schedule Site Visit
              </Link>
            </div>
          )}
        </div>

        <NotificationBell />

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg p-1 hover:bg-[#F4F4F5] transition-colors cursor-pointer"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0A0A0A] text-xs font-semibold text-white shadow-2xs">
              {initials}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-semibold text-[#09090B] leading-tight">{user.name}</p>
              <p className="text-[11px] text-[#71717A] leading-tight">{ROLE_LABELS[user.role]}</p>
            </div>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-xl border border-[#E4E4E7] bg-white p-1.5 shadow-lg z-40">
              <div className="px-3 py-2 border-b border-[#E4E4E7] sm:hidden">
                <p className="text-xs font-semibold text-[#09090B]">{user.name}</p>
                <p className="text-[11px] text-[#71717A]">{ROLE_LABELS[user.role]}</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 h-full w-64 shadow-2xl">
            <button
              className="absolute right-3 top-4 z-10 text-[#71717A] hover:text-white cursor-pointer"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar
              role={user.role}
              employeeDirectoryLabel={employeeDirectoryLabel}
              user={user}
              mobile
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
