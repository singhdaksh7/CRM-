"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/permissions";
import type { Role } from "@prisma/client";
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
  Building,
  ChevronLeft,
  ChevronRight,
  FileText
} from "lucide-react";
import { useState } from "react";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/dashboard": LayoutDashboard,
  "/properties": Building2,
  "/leads": Users,
  "/visits": CalendarClock,
  "/follow-ups": BellRing,
  "/documents": FileText,
  "/notifications": Bell,
  "/employees": UserCog,
  "/reports": BarChart3,
  "/settings": Settings,
};

export function Sidebar({ role, mobile, onNavigate }: { role: Role; mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const items = NAV_ITEMS.filter((n) => n.roles.includes(role));

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-[#11151F] border-r border-[rgba(255,255,255,0.08)] transition-all duration-200 select-none",
        collapsed ? "w-20" : "w-64",
        !mobile && "hidden lg:flex"
      )}
    >
      <div className="flex h-16 items-center justify-between px-4 border-b border-[rgba(255,255,255,0.08)]">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#4F8CFF] text-white shadow-sm font-bold text-lg">
            D
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-[#F8FAFC]">Delhi Broker</span>
              <span className="text-[10px] font-semibold text-[#4F8CFF] uppercase tracking-wider">CRM Enterprise</span>
            </div>
          )}
        </div>
        {!mobile && (
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-[#94A3B8] hover:bg-[#1E2533] hover:text-[#F8FAFC] transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
        {items.map((item) => {
          const Icon = ICONS[item.href] ?? LayoutDashboard;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-[#4F8CFF] text-white shadow-sm font-semibold"
                  : "text-[#CBD5E1] hover:bg-[#1E2533] hover:text-white"
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active ? "text-white" : "text-[#94A3B8]")} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="border-t border-[rgba(255,255,255,0.08)] px-4 py-3 text-xs text-[#64748B]">
          Delhi Broker CRM &middot; NCR Edition
        </div>
      )}
    </aside>
  );
}
