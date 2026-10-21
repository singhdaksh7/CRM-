"use client";

import { useEffect } from "react";
import { initInstallStore } from "@/lib/pwa/install-store";

/** Attaches install listeners at app start so beforeinstallprompt is never missed. */
export function InstallStoreInit() {
  useEffect(() => {
    initInstallStore();
  }, []);
  return null;
}
