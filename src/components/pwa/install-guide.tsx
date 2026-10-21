"use client";

import { promptInstall } from "@/lib/pwa/install-store";
import { InstallGuideView } from "./install-guide-view";
import { useInstallState } from "./use-install-state";

export function InstallGuide() {
  const state = useInstallState();
  return <InstallGuideView state={state} onInstall={() => void promptInstall()} />;
}
