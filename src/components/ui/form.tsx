import { cn } from "@/lib/utils";

export function Field({ label, error, hint, required, children }: { label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
        {label} {required && <span className="text-[#EF4444]">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-[#94A3B8]">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-[#EF4444]">{error}</p>}
    </div>
  );
}

const inputBase = "block w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#11151F] py-2 px-3 text-sm text-[#F8FAFC] placeholder:text-[#64748B] focus:border-[#4F8CFF] focus:outline-none focus:ring-1 focus:ring-[#4F8CFF] transition-all disabled:opacity-50 disabled:cursor-not-allowed";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputBase, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputBase, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputBase, "bg-[#11151F] text-[#F8FAFC]", props.className)} />;
}

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-[#CBD5E1] cursor-pointer">
      <input type="checkbox" className="h-4 w-4 rounded border-[rgba(255,255,255,0.14)] bg-[#11151F] text-[#4F8CFF] focus:ring-[#4F8CFF] focus:ring-offset-0" {...props} />
      {label}
    </label>
  );
}
