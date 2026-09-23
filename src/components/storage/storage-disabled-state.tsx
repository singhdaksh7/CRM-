"use client";

import { useSession } from "next-auth/react";
import { CloudOff } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

/** Shown wherever uploads/downloads are unavailable because STORAGE_PROVIDER=DISABLED (or unset). Never a raw server error - see AGENTS.md section 3/26. */
export function StorageDisabledState({ compact }: { compact?: boolean }) {
  const { data: session } = useSession();
  const role = session?.user?.role;

  return (
    <div
      className={
        compact
          ? "flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3"
          : "flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 py-10 px-4 text-center"
      }
    >
      <div className={compact ? "shrink-0 rounded-full bg-amber-100 p-2 text-amber-600" : "rounded-full bg-amber-100 p-3 text-amber-600"}>
        <CloudOff className={compact ? "h-4 w-4" : "h-7 w-7"} />
      </div>
      <div className={compact ? "" : "mt-3"}>
        <p className="text-sm font-semibold text-zinc-900">File storage is not configured yet</p>
        <p className="mt-0.5 max-w-sm text-xs text-zinc-500">Image and document uploads will be available after secure cloud storage is connected.</p>
      </div>
      {role === "ADMIN" && (
        <div className={compact ? "ml-auto shrink-0" : "mt-3"}>
          <LinkButton href="/settings" size="sm" variant="secondary">
            Open System Settings
          </LinkButton>
        </div>
      )}
      {role === "DATA_MANAGER" && <p className="mt-2 text-xs text-zinc-500">Contact your Admin to enable storage.</p>}
    </div>
  );
}
