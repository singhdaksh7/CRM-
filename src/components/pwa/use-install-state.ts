"use client";

import { useSyncExternalStore } from "react";
import { getInstallState, getServerInstallState, subscribeInstallStore } from "@/lib/pwa/install-store";

export function useInstallState() {
  return useSyncExternalStore(subscribeInstallStore, getInstallState, getServerInstallState);
}
