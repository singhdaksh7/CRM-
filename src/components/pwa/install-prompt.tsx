"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

const DISMISSED_KEY = "pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Phase 4, Objective 14 - install prompt. Only renders when the browser
 * actually fires beforeinstallprompt (Chromium-based browsers; Safari has
 * no such event and relies on the user manually using "Add to Home
 * Screen", which this banner doesn't need to handle). Desktop is
 * unaffected either way since the banner is purely additive - the
 * existing Sidebar/desktop layout is untouched.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => typeof window !== "undefined" && localStorage.getItem(DISMISSED_KEY) === "true");

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 flex items-center justify-between gap-3 rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-lg lg:bottom-4 lg:left-auto lg:right-4 lg:w-96">
      <div>
        <p className="text-sm font-semibold text-[#1B2430]">Install this app</p>
        <p className="text-xs text-[#596579]">Add to your home screen for quick, app-like access.</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" onClick={install}>
          <Download className="h-4 w-4" /> Install
        </Button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded-lg p-1.5 text-[#8A94A6] hover:bg-[#F3F6FA]">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
