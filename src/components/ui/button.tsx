import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "whatsapp" | "outline";
type Size = "sm" | "md" | "lg" | "touch";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-[#0A0A0A] text-white hover:bg-[#27272A] active:bg-[#18181B] focus-visible:ring-2 focus-visible:ring-[#0A0A0A] shadow-xs border border-[#0A0A0A]",
  secondary: "bg-white text-[#09090B] border border-[#E4E4E7] hover:bg-[#F4F4F5] hover:border-[#D4D4D8] active:bg-[#E4E4E7] shadow-xs",
  whatsapp: "bg-[#25D366] text-white hover:bg-[#20bd5a] active:bg-[#1ca64f] shadow-xs",
  danger: "bg-[#DC2626] text-white hover:bg-[#B91C1C] active:bg-[#991B1B] shadow-xs",
  outline: "bg-transparent text-[#52525B] border border-[#E4E4E7] hover:bg-[#F4F4F5] hover:text-[#09090B]",
  ghost: "bg-transparent text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#09090B]",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs rounded-lg font-medium",
  md: "px-3.5 py-2 text-sm rounded-lg font-medium",
  lg: "px-4 py-2.5 text-base rounded-lg font-medium",
  touch: "px-5 py-3 text-base rounded-lg font-medium min-h-[44px]",
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
        "inline-flex items-center justify-center gap-2 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer select-none",
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
        "inline-flex items-center justify-center gap-2 transition-all duration-150 select-none",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
    >
      {children}
    </Link>
  );
}
