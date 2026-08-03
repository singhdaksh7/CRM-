"use client";

import { useSession } from "next-auth/react";
import { MapPinOff } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

/** Shown wherever address search/maps are unavailable because MAPS_PROVIDER=DISABLED (or unset). Manual address fields and external "Open in Google Maps" links keep working regardless - only search/preview/route features need this state. */
export function MapsDisabledState({ compact }: { compact?: boolean }) {
  const { data: session } = useSession();
  const role = session?.user?.role;

  return (
    <div className={compact ? "flex items-center gap-3 rounded-lg border border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.06)] px-4 py-3" : "flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.05)] py-8 px-4 text-center"}>
      <div className={compact ? "shrink-0 rounded-full bg-[rgba(245,158,11,0.15)] p-2 text-[#F59E0B]" : "rounded-full bg-[rgba(245,158,11,0.15)] p-3 text-[#F59E0B]"}>
        <MapPinOff className={compact ? "h-4 w-4" : "h-6 w-6"} />
      </div>
      <div className={compact ? "" : "mt-2"}>
        <p className="text-sm font-semibold text-[#F8FAFC]">Maps integration is not configured</p>
        <p className="mt-0.5 max-w-sm text-xs text-[#94A3B8]">Address search and map previews will be available once Google Maps is connected. You can still enter the address manually.</p>
      </div>
      {role === "ADMIN" && (
        <div className={compact ? "ml-auto shrink-0" : "mt-3"}>
          <LinkButton href="/settings" size="sm" variant="secondary">
            Open System Settings
          </LinkButton>
        </div>
      )}
      {role === "DATA_MANAGER" && <p className="mt-2 text-xs text-[#94A3B8]">Contact your Admin to enable maps.</p>}
    </div>
  );
}
