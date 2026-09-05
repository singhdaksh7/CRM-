"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, canAccess } from "@/lib/permissions";
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
  BookOpen,
  Plug,
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
  "/catalogues": BookOpen,
  "/integrations": Plug,
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

  // B1 - Role-specific navigation mapping
  const menuConfig = {
    ADMIN: {
      main: [
        { href: "/dashboard", label: "Today", icon: LayoutDashboard },
        { href: "/leads", label: "Leads", icon: Users },
        { href: "/properties", label: "Properties", icon: Building2 },
        { href: "/visits", label: "Visits", icon: CalendarClock },
        { href: "/follow-ups", label: "Follow-ups", icon: BellRing },
      ],
      more: [
        { href: "/catalogues", label: "Catalogues", icon: BookOpen },
        { href: "/customers", label: "Demand", icon: ContactRound },
        { href: "/deals", label: "Deals", icon: Briefcase },
        { href: "/employees", label: "Team", icon: UserCog },
        { href: "/reports", label: "Reports", icon: BarChart3 },
        { href: "/notifications", label: "Notifications", icon: Bell },
      ],
      admin: [
        // No page exists at the bare "/integrations" path (only its
        // "/property-portals" child does) - pointing here instead of at that
        // dead route so the link actually resolves.
        { href: "/integrations/property-portals", label: "Property Portals", icon: Plug },
        { href: "/documents", label: "Documents", icon: FileText },
        { href: "/settings", label: "Settings", icon: Settings },
        { href: "/admin/property-issues", label: "Property Issues", icon: ShieldAlert },
        { href: "/inventory-partners", label: "Partners", icon: Handshake },
      ]
    },
    DATA_MANAGER: {
      main: [
        { href: "/dashboard", label: "Today", icon: LayoutDashboard },
        { href: "/leads", label: "Leads", icon: Users },
        { href: "/properties", label: "Properties", icon: Building2 },
        { href: "/visits", label: "Visits", icon: CalendarClock },
        { href: "/follow-ups", label: "Follow-ups", icon: BellRing },
      ],
      more: [
        { href: "/catalogues", label: "Catalogues", icon: BookOpen },
        { href: "/notifications", label: "Notifications", icon: Bell },
        { href: "/documents", label: "Documents", icon: FileText },
        // DATA_MANAGER can import Housing.com lead exports (see
        // canImportHousingLeads in the property-portals page and the
        // ["ADMIN","DATA_MANAGER"] check on the housing-import page), but had
        // no sidebar entry point at all to reach it - only ADMIN's menuConfig
        // listed an Integrations link.
        { href: "/integrations/property-portals", label: "Property Portals", icon: Plug },
      ],
      admin: []
    },
    FIELD_EXECUTIVE: {
      main: [
        { href: "/executive-dashboard", label: "Today", icon: LayoutDashboard },
        { href: "/leads", label: "My Leads", icon: Users },
        { href: "/visits", label: "My Visits", icon: CalendarClock },
        { href: "/properties", label: "Visit Properties", icon: Building2 },
      ],
      more: [],
      admin: []
    }
  };

  const config = menuConfig[role] || menuConfig.FIELD_EXECUTIVE;
  const mainItems = config.main.filter(item => canAccess(role, item.href));
  const moreItems = config.more.filter(item => canAccess(role, item.href));
  const adminItems = config.admin.filter(item => canAccess(role, item.href));

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
              <span className="text-sm font-bold tracking-tight text-[#1B2430]">KP Properties</span>
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

      <nav className="flex-1 space-y-4 p-3 overflow-y-auto">
        <div className="space-y-1">
          {mainItems.map((item) => {
            const Icon = item.icon;
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
        </div>

        {moreItems.length > 0 && (
          <div className="space-y-1 pt-2">
            {!collapsed && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#8A94A6] mb-1">
                More
              </p>
            )}
            {moreItems.map((item) => {
              const Icon = item.icon;
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
          </div>
        )}

        {adminItems.length > 0 && (
          <div className="space-y-1 pt-2">
            {!collapsed && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#8A94A6] mb-1">
                Administration
              </p>
            )}
            {adminItems.map((item) => {
              const Icon = item.icon;
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
          </div>
        )}
      </nav>

      {!collapsed && (
        <div className="border-t border-[#E7ECF2] px-4 py-3 text-xs text-[#8A94A6]">
          KP Properties &middot; CRM
        </div>
      )}
    </aside>
  );
}
