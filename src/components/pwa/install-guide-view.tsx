import { CheckCircle2, Download, Laptop, Monitor, Smartphone, Tablet, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supportsNativePrompt, type InstallPlatform } from "@/lib/pwa/install";
import type { InstallState } from "@/lib/pwa/install-store";
import {
  DEVICE_GUIDES,
  FIREFOX_NOTE,
  INSTALLED_MESSAGE,
  INSTALL_INTRO,
  IOS_NON_SAFARI_NOTE,
  type DeviceGuide,
} from "@/lib/pwa/install-instructions";

const ICONS: Record<DeviceGuide["platform"], React.ComponentType<{ className?: string }>> = {
  ios: Tablet,
  android: Smartphone,
  windows: Monitor,
  mac: Laptop,
};

interface Props {
  state: InstallState;
  onInstall: () => void;
}

/** Presentational: all behaviour arrives via props so it can be rendered for any device in tests. */
export function InstallGuideView({ state, onInstall }: Props) {
  const { env, canPrompt, installed, lastOutcome } = state;
  const isInstalled = installed || env?.standalone === true;
  const current: InstallPlatform | null = env?.platform ?? null;
  const nativeOffered = !isInstalled && canPrompt && env !== null && supportsNativePrompt(env);

  // Show the visitor's own device first.
  const guides = [...DEVICE_GUIDES].sort((a, b) => Number(b.platform === current) - Number(a.platform === current));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="border-b border-[#E4E4E7] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#09090B]">Install KP CRM</h1>
        <p className="mt-1 text-sm text-[#52525B]">{INSTALL_INTRO}</p>
      </div>

      {isInstalled && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-sm font-semibold text-[#166534]">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {INSTALLED_MESSAGE}
        </div>
      )}

      {nativeOffered && (
        <div className="flex flex-col gap-3 rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#09090B]">Ready to install on this device</p>
            <p className="text-xs text-[#71717A]">Your browser will ask you to confirm.</p>
          </div>
          <Button size="touch" onClick={onInstall} className="w-full sm:w-auto">
            <Download className="h-4 w-4" /> Install KP CRM
          </Button>
        </div>
      )}

      {!isInstalled && lastOutcome === "dismissed" && (
        <p role="status" className="text-sm text-[#52525B]">
          Installation was cancelled. You can install any time using the steps below.
        </p>
      )}

      {!isInstalled && env?.platform === "ios" && env.browser !== "safari" && <Note>{IOS_NON_SAFARI_NOTE}</Note>}
      {!isInstalled && env?.browser === "firefox" && env.platform !== "ios" && <Note>{FIREFOX_NOTE}</Note>}

      <div className="grid gap-4 md:grid-cols-2">
        {guides.map((guide) => {
          const Icon = ICONS[guide.platform];
          const isCurrent = guide.platform === current;
          // Steps are the fallback: hide them on this device while a native button is on offer.
          const showSteps = !(isCurrent && nativeOffered);
          return (
            <section
              key={guide.platform}
              aria-labelledby={`device-${guide.platform}`}
              data-device={guide.platform}
              className={cn("min-w-0 rounded-xl border bg-white p-5 shadow-xs", isCurrent ? "border-[#09090B]" : "border-[#E4E4E7]")}
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] text-[#09090B]">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 id={`device-${guide.platform}`} className="text-sm font-semibold text-[#09090B]">
                    {guide.title}
                  </h2>
                  <p className="text-xs text-[#71717A]">{guide.subtitle}</p>
                </div>
                {isCurrent && (
                  <span className="ml-auto shrink-0 rounded-full bg-[#09090B] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    This device
                  </span>
                )}
              </div>
              {showSteps ? (
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[#27272A]">
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-[#52525B]">Use the Install KP CRM button above.</p>
              )}
              {guide.note && showSteps && <p className="mt-3 border-t border-[#F4F4F5] pt-3 text-xs text-[#71717A]">{guide.note}</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div role="note" className="flex items-start gap-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4 text-sm text-[#92400E]">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
