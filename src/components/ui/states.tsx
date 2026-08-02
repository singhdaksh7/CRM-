import { Inbox, Loader2, AlertTriangle, ShieldAlert } from "lucide-react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.14)] bg-[#181E2A] py-16 px-4 text-center">
      <div className="rounded-full bg-[#1E2533] p-3 text-[#94A3B8]">
        <Inbox className="h-8 w-8" />
      </div>
      <p className="mt-3 text-base font-semibold text-[#F8FAFC]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-[#94A3B8]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-[#94A3B8]">
      <Loader2 className="h-7 w-7 animate-spin text-[#4F8CFF]" />
      <p className="mt-3 text-sm font-medium">{label}</p>
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.06)] py-12 px-4 text-center">
      <div className="rounded-full bg-[rgba(239,68,68,0.12)] p-3 text-[#EF4444]">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <p className="mt-3 text-base font-semibold text-[#EF4444]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-[#CBD5E1]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PermissionState({ title = "Access Restricted", description = "You do not have permission to view this section." }: { title?: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] py-16 px-4 text-center">
      <div className="rounded-full bg-[rgba(245,158,11,0.12)] p-3 text-[#F59E0B]">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <p className="mt-3 text-base font-semibold text-[#F8FAFC]">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-[#94A3B8]">{description}</p>
    </div>
  );
}
