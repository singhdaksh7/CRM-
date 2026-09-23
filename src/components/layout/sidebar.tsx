"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { canAccess, ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarClock,
  BellRing,
  Bell,
  UserCog,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  FileText,
  Briefcase,
  Handshake,
  ShieldAlert,
  BookOpen,
  Plug,
  LogOut,
} from "lucide-react";
import { useState } from "react";

interface NavLinkItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title?: string;
  items: NavLinkItem[];
}

export function Sidebar({
  role,
  employeeDirectoryLabel = "Team",
  mobile,
  onNavigate,
  user,
}: {
  role: Role;
  employeeDirectoryLabel?: string;
  mobile?: boolean;
  onNavigate?: () => void;
  user?: { name: string; role: Role };
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const menuConfig: Record<Role, NavGroup[]> = {
    ADMIN: [
      {
        title: "Work",
        items: [
          { href: "/dashboard", label: "Today", icon: LayoutDashboard },
        ],
      },
      {
        title: "CRM",
        items: [
          { href: "/leads", label: "Leads", icon: Users },
          { href: "/properties", label: "Properties", icon: Building2 },
          { href: "/catalogues", label: "Catalogues", icon: BookOpen },
          { href: "/deals", label: "Deals", icon: Briefcase },
        ],
      },
      {
        title: "Operations",
        items: [
          { href: "/visits", label: "Visits", icon: CalendarClock },
          { href: "/follow-ups", label: "Follow-ups", icon: BellRing },
        ],
      },
      {
        title: "Team",
        items: [
          { href: "/employees", label: employeeDirectoryLabel, icon: UserCog },
        ],
      },
      {
        title: "Insights",
        items: [
          { href: "/reports", label: "Reports", icon: BarChart3 },
          { href: "/notifications", label: "Notifications", icon: Bell },
        ],
      },
      {
        title: "System",
        items: [
          { href: "/integrations/property-portals", label: "Property Portals", icon: Plug },
          { href: "/documents", label: "Documents", icon: FileText },
          { href: "/settings", label: "Settings", icon: Settings },
          { href: "/admin/property-issues", label: "Property Issues", icon: ShieldAlert },
          { href: "/inventory-partners", label: "Partners", icon: Handshake },
        ],
      },
    ],
    DATA_MANAGER: [
      {
        title: "Work",
        items: [
          { href: "/dashboard", label: "Today", icon: LayoutDashboard },
        ],
      },
      {
        title: "CRM",
        items: [
          { href: "/leads", label: "Leads", icon: Users },
          { href: "/properties", label: "Properties", icon: Building2 },
          { href: "/catalogues", label: "Catalogues", icon: BookOpen },
        ],
      },
      {
        title: "Operations",
        items: [
          { href: "/visits", label: "Visits", icon: CalendarClock },
          { href: "/follow-ups", label: "Follow-ups", icon: BellRing },
        ],
      },
      {
        title: "Insights",
        items: [
          { href: "/notifications", label: "Notifications", icon: Bell },
          { href: "/documents", label: "Documents", icon: FileText },
        ],
      },
      {
        title: "System",
        items: [
          { href: "/integrations/property-portals", label: "Property Portals", icon: Plug },
        ],
      },
    ],
    FIELD_EXECUTIVE: [
      {
        title: "Work",
        items: [
          { href: "/executive-dashboard", label: "Today", icon: LayoutDashboard },
        ],
      },
      {
        title: "Field Operations",
        items: [
          { href: "/leads", label: "My Leads", icon: Users },
          { href: "/visits", label: "My Visits", icon: CalendarClock },
          { href: "/properties", label: "Visit Properties", icon: Building2 },
        ],
      },
    ],
  };

  const groups = menuConfig[role] || menuConfig.FIELD_EXECUTIVE;
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccess(role, item.href)),
    }))
    .filter((group) => group.items.length > 0);

  const initials = user?.name
    ? user.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join("")
    : "KP";

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-[#0A0A0A] text-white border-r border-[#1F1F23] transition-all duration-200 select-none",
        collapsed ? "w-18" : "w-64",
        !mobile && "hidden lg:flex"
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-[#1F1F23]">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#0A0A0A] font-bold text-xs shadow-xs">
            KP
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold tracking-tight text-white truncate">KP PROPERTIES</span>
              <span className="text-[10px] font-medium text-[#71717A] uppercase tracking-wider">CRM Enterprise</span>
            </div>
          )}
        </div>
        {!mobile && (
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg text-[#71717A] hover:bg-[#18181B] hover:text-white transition-colors cursor-pointer"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Navigation list */}
      <nav className="flex-1 space-y-4 p-3 overflow-y-auto overflow-x-hidden">
        {filteredGroups.map((group, groupIdx) => (
          <div key={group.title || groupIdx} className="space-y-1">
            {!collapsed && group.title && (
              <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#71717A]">
                {group.title}
              </p>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/dashboard" || item.href === "/executive-dashboard"
                ? pathname === item.href
                : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-white text-[#0A0A0A] font-semibold shadow-xs"
                      : "text-[#A1A1AA] hover:bg-[#18181B] hover:text-white"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[#0A0A0A]" : "text-[#A1A1AA]")} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Account / Footer */}
      <div className="shrink-0 border-t border-[#1F1F23] p-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#18181B] border border-[#27272A] text-xs font-semibold text-white"
              title={user?.name ? `${user.name} (${ROLE_LABELS[role]})` : "User account"}
            >
              {initials}
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              aria-label="Sign out"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#71717A] hover:bg-[#18181B] hover:text-[#DC2626] transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-lg p-1.5 hover:bg-[#141416] transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#18181B] border border-[#27272A] text-xs font-semibold text-white">
                {initials}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-white truncate leading-tight">
                  {user?.name || "Account"}
                </span>
                <span className="text-[11px] text-[#71717A] truncate leading-tight">
                  {ROLE_LABELS[role] || role}
                </span>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              aria-label="Sign out"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#71717A] hover:bg-[#18181B] hover:text-[#DC2626] transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
