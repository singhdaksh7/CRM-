import { cn } from "@/lib/utils";

export function Field({ label, error, hint, required, children }: { label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#596579]">
        {label} {required && <span className="text-[#E5484D]">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-[#8A94A6]">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-[#E5484D]">{error}</p>}
    </div>
  );
}

const inputBase = "block w-full rounded-xl border border-[#E7ECF2] bg-white py-2 px-3 text-sm text-[#1B2430] placeholder:text-[#8A94A6] focus:border-[#3366FF] focus:outline-none focus:ring-1 focus:ring-[#3366FF] transition-all disabled:opacity-50 disabled:cursor-not-allowed";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputBase, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputBase, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputBase, "bg-white text-[#1B2430]", props.className)} />;
}

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-[#596579] cursor-pointer">
      <input type="checkbox" className="h-4 w-4 rounded border-[#E7ECF2] bg-white text-[#3366FF] focus:ring-[#3366FF] focus:ring-offset-0" {...props} />
      {label}
    </label>
  );
}
