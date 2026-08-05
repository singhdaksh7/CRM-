"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/reports", label: "Overview" },
  { href: "/reports/employees", label: "Employee Performance" },
  { href: "/reports/localities", label: "Localities" },
  { href: "/reports/brokerage", label: "Brokerage" },
  { href: "/reports/lost-deals", label: "Lost Deals" },
  { href: "/reports/activity", label: "Activity" },
  { href: "/reports/builder", label: "Report Builder" },
];

export function ReportsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-1.5 border-b border-[#E7ECF2] pb-3">
      {TABS.map((tab) => {
        const active = tab.href === "/reports" ? pathname === "/reports" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              active ? "bg-[#3366FF] text-white" : "text-[#596579] hover:bg-[#F3F6FA]"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
