"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isBannerSnoozed, shouldShowBanner, snoozeBanner, type KeyValueStore } from "@/lib/pwa/install";
import { promptInstall } from "@/lib/pwa/install-store";
import { useInstallState } from "./use-install-state";

function getStore(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Small dismissible banner for signed-in users who have not installed the
 * app. "Not now" snoozes it for 30 days (localStorage), so it never nags on
 * every page load. Rendered only inside the authenticated (app) layout.
 */
export function InstallBanner() {
  const { env, canPrompt, installed } = useInstallState();
  const pathname = usePathname();
  const [snoozed, setSnoozed] = useState(() => isBannerSnoozed(getStore(), Date.now()));

  if (!shouldShowBanner({ env, canPrompt, installed, snoozed, pathname })) return null;

  function dismiss() {
    snoozeBanner(getStore(), Date.now());
    setSnoozed(true);
  }

  return (
    <div
      role="region"
      aria-label="Install KP CRM"
      className="fixed bottom-20 left-4 right-4 z-40 flex items-center justify-between gap-3 rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-lg lg:bottom-4 lg:left-auto lg:right-4 lg:w-96"
    >
      <p className="text-sm font-semibold text-[#09090B]">Install KP CRM for faster access</p>
      <div className="flex shrink-0 items-center gap-2">
        {canPrompt ? (
          <Button size="sm" onClick={() => void promptInstall()}>
            <Download className="h-4 w-4" /> Install
          </Button>
        ) : (
          <Link
            href="/settings/install"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#0A0A0A] bg-[#0A0A0A] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#27272A]"
          >
            <Download className="h-4 w-4" /> Install
          </Link>
        )}
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Not now
        </Button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#09090B]">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
