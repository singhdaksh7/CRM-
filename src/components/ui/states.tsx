import { Inbox, Loader2, AlertTriangle, ShieldAlert } from "lucide-react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#C3C5D8] bg-white py-16 px-4 text-center shadow-xs">
      <div className="rounded-full bg-[#F3F6FA] p-3 text-[#596579]">
        <Inbox className="h-8 w-8" />
      </div>
      <p className="mt-3 text-base font-semibold text-[#1B2430]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-[#596579]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-[#596579]">
      <Loader2 className="h-7 w-7 animate-spin text-[#3366FF]" />
      <p className="mt-3 text-sm font-medium">{label}</p>
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[#FFC7C9] bg-[#FFECEC] py-12 px-4 text-center shadow-xs">
      <div className="rounded-full bg-[#FFD8D9] p-3 text-[#E5484D]">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <p className="mt-3 text-base font-semibold text-[#E5484D]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-[#596579]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PermissionState({ title = "Access Restricted", description = "You do not have permission to view this section." }: { title?: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E7ECF2] bg-white py-16 px-4 text-center shadow-xs">
      <div className="rounded-full bg-[#FFF6E5] p-3 text-[#E6A23C]">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <p className="mt-3 text-base font-semibold text-[#1B2430]">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-[#596579]">{description}</p>
    </div>
  );
}
