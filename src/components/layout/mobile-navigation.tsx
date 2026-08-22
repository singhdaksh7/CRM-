import React from "react";
import Link from "next/link";
import { LayoutDashboard, Users, Building2, CalendarClock, ContactRound, BookOpen } from "lucide-react";
import type { Role } from "@prisma/client";

export function MobileNavigation({ role }: { role: Role }) {
  // simplified-role-workflow: DATA_MANAGER and FIELD_EXECUTIVE get the same
  // trimmed bottom bar centered on Today's Work / Leads / Visits / Catalogues
  // (matching their sidebar); ADMIN keeps the original wider bar.
  const items =
    role === "FIELD_EXECUTIVE" || role === "DATA_MANAGER"
      ? [
          { label: "Today", href: "/executive-dashboard", icon: LayoutDashboard },
          { label: "Leads", href: "/leads", icon: Users },
          { label: "Visits", href: "/visits", icon: CalendarClock },
          { label: "Catalogues", href: "/catalogues", icon: BookOpen },
        ]
      : [
          { label: "Home", href: "/dashboard", icon: LayoutDashboard },
          { label: "Leads", href: "/leads", icon: Users },
          { label: "Customers", href: "/customers", icon: ContactRound },
          { label: "Properties", href: "/properties", icon: Building2 },
          { label: "Visits", href: "/visits", icon: CalendarClock },
        ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-[#E7ECF2] bg-white px-2 lg:hidden shadow-lg">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-1 text-[#596579] hover:text-[#3366FF] transition-colors"
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
