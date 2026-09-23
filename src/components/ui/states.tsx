import { Inbox, Loader2, AlertTriangle, ShieldAlert } from "lucide-react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E4E4E7] bg-white py-12 px-4 text-center">
      <div className="rounded-full bg-[#F4F4F5] p-3 text-[#71717A]">
        <Inbox className="h-6 w-6" />
      </div>
      <p className="mt-3 text-sm font-semibold text-[#09090B]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-[#71717A]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-[#71717A]">
      <Loader2 className="h-6 w-6 animate-spin text-[#09090B]" />
      <p className="mt-2 text-xs font-medium text-[#71717A]">{label}</p>
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[#FECACA] bg-[#FEF2F2] py-10 px-4 text-center">
      <div className="rounded-full bg-[#FEE2E2] p-2.5 text-[#DC2626]">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="mt-3 text-sm font-semibold text-[#B91C1C]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-[#7F1D1D]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PermissionState({ title = "Access Restricted", description = "You do not have permission to view this section." }: { title?: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[#E4E4E7] bg-white py-12 px-4 text-center">
      <div className="rounded-full bg-[#FFFBEB] p-3 text-[#D97706]">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <p className="mt-3 text-sm font-semibold text-[#09090B]">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-[#71717A]">{description}</p>
    </div>
  );
}
