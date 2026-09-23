import { cn } from "@/lib/utils";

export function Field({ label, error, hint, required, children }: { label: React.ReactNode; error?: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#52525B]">
        {label} {required && <span className="text-[#DC2626]">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-[#71717A]">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-[#DC2626]">{error}</p>}
    </div>
  );
}

const inputBase = "block w-full rounded-lg border border-[#E4E4E7] bg-white py-2 px-3 text-sm text-[#09090B] placeholder:text-[#A1A1AA] focus:border-[#0A0A0A] focus:outline-none focus:ring-1 focus:ring-[#0A0A0A] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputBase, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputBase, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputBase, "bg-white text-[#09090B] pr-8", props.className)} />;
}

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-[#52525B] cursor-pointer select-none">
      <input type="checkbox" className="h-4 w-4 rounded border-[#E4E4E7] bg-white text-[#0A0A0A] focus:ring-[#0A0A0A] focus:ring-offset-0 transition-colors" {...props} />
      <span>{label}</span>
    </label>
  );
}
