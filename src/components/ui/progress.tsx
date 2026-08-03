import { cn } from "@/lib/utils";

export function ProgressBar({ value, label, className }: { value: number; label?: string; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("w-full", className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#11151F]" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-[#4F8CFF] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

/** For fetch-based uploads where exact byte progress isn't measurable - shows real, discrete stages instead of a fabricated percentage. */
export function StageProgress({ stage }: { stage: "preparing" | "uploading" | "verifying" | "completed" | "failed" }) {
  const STAGES: { key: typeof stage; label: string }[] = [
    { key: "preparing", label: "Preparing" },
    { key: "uploading", label: "Uploading" },
    { key: "verifying", label: "Verifying" },
    { key: "completed", label: "Completed" },
  ];
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#94A3B8]" aria-live="polite">
      {STAGES.map((s, i) => (
        <span key={s.key} className={cn("flex items-center gap-1.5", i > 0 && "before:mx-1 before:content-['\\2192']")}>
          <span className={stage === "failed" && i === idx ? "text-[#EF4444]" : i <= idx ? "text-[#4F8CFF]" : ""}>{s.label}</span>
        </span>
      ))}
    </div>
  );
}
