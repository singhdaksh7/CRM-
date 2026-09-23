"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Building2, CalendarClock } from "lucide-react";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";

export function MobileNavigation({ role }: { role: Role }) {
  const pathname = usePathname();

  let items = [
    { label: "Today", href: "/dashboard", icon: LayoutDashboard },
    { label: "Leads", href: "/leads", icon: Users },
    { label: "Properties", href: "/properties", icon: Building2 },
    { label: "Visits", href: "/visits", icon: CalendarClock },
  ];

  if (role === "FIELD_EXECUTIVE") {
    items = [
      { label: "Today", href: "/executive-dashboard", icon: LayoutDashboard },
      { label: "My Leads", href: "/leads", icon: Users },
      { label: "My Visits", href: "/visits", icon: CalendarClock },
      { label: "Properties", href: "/properties", icon: Building2 },
    ];
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-[#E4E4E7] bg-white px-2 lg:hidden shadow-xs">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.href === "/dashboard" || item.href === "/executive-dashboard"
          ? pathname === item.href
          : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1.5 transition-colors rounded-lg",
              active ? "text-[#09090B] font-semibold" : "text-[#71717A] hover:text-[#09090B]"
            )}
          >
            <Icon className={cn("h-5 w-5", active ? "text-[#09090B]" : "text-[#71717A]")} />
            <span className="text-[10px]">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
