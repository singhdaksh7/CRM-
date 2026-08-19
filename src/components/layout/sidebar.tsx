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
  ChevronLeft,
  ChevronRight,
  FileText,
  Crown,
  Briefcase,
  Handshake,
  ShieldAlert,
  MessageCircle,
  ContactRound,
} from "lucide-react";
import { useState } from "react";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/dashboard": LayoutDashboard,
  "/executive-dashboard": Briefcase,
  "/owner-dashboard": Crown,
  "/properties": Building2,
  "/inventory-partners": Handshake,
  "/admin/property-issues": ShieldAlert,
  "/leads": Users,
  "/customers": ContactRound,
  "/whatsapp": MessageCircle,
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
        "flex h-full flex-col bg-white border-r border-[#E7ECF2] transition-all duration-200 select-none shadow-xs",
        collapsed ? "w-20" : "w-64",
        !mobile && "hidden lg:flex"
      )}
    >
      <div className="flex h-16 items-center justify-between px-4 border-b border-[#E7ECF2]">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3366FF] text-white shadow-xs font-bold text-lg">
            KP
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-[#1B2430]">Delhi Broker</span>
              <span className="text-[10px] font-semibold text-[#3366FF] uppercase tracking-wider">CRM Enterprise</span>
            </div>
          )}
        </div>
        {!mobile && (
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg text-[#596579] hover:bg-[#F3F6FA] hover:text-[#1B2430] transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
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
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-[#3366FF] text-white shadow-xs font-semibold"
                  : "text-[#596579] hover:bg-[#F3F6FA] hover:text-[#1B2430]"
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active ? "text-white" : "text-[#8A94A6]")} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="border-t border-[#E7ECF2] px-4 py-3 text-xs text-[#8A94A6]">
          Delhi Broker CRM &middot; NCR Edition
        </div>
      )}
    </aside>
  );
}
