import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "whatsapp" | "outline";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-[#4F8CFF] text-white hover:bg-[#6BA0FF] active:bg-[#3B7BEB] focus-visible:ring-2 focus-visible:ring-[#4F8CFF] shadow-sm",
  secondary: "bg-[#1E2533] text-[#F8FAFC] border border-[rgba(255,255,255,0.08)] hover:bg-[#252D3D] hover:border-[rgba(255,255,255,0.14)] active:bg-[#2B3446]",
  whatsapp: "bg-[#25D366] text-white hover:bg-[#22bf5b] active:bg-[#1fae52] shadow-sm",
  danger: "bg-[#EF4444] text-white hover:bg-[#dc2626] active:bg-[#b91c1c]",
  outline: "bg-transparent text-[#CBD5E1] border border-[rgba(255,255,255,0.14)] hover:bg-[#1E2533] hover:text-white",
  ghost: "bg-transparent text-[#CBD5E1] hover:bg-[#1E2533] hover:text-white",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs rounded-md",
  md: "px-3.5 py-2 text-sm rounded-lg",
  lg: "px-4 py-2.5 text-base rounded-lg",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer select-none",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 select-none",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
    >
      {children}
    </Link>
  );
}
