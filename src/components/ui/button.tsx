import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "whatsapp" | "outline";
type Size = "sm" | "md" | "lg" | "touch";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-[#3366FF] text-white hover:bg-[#2952CC] active:bg-[#1F3D99] focus-visible:ring-2 focus-visible:ring-[#3366FF] shadow-xs",
  secondary: "bg-white text-[#1B2430] border border-[#E7ECF2] hover:bg-[#F3F6FA] hover:border-[#C3C5D8] active:bg-[#E5EEFF] shadow-xs",
  whatsapp: "bg-[#25D366] text-white hover:bg-[#20bd5a] active:bg-[#1ca64f] shadow-xs",
  danger: "bg-[#E5484D] text-white hover:bg-[#c93b40] active:bg-[#b03035] shadow-xs",
  outline: "bg-transparent text-[#596579] border border-[#E7ECF2] hover:bg-[#F3F6FA] hover:text-[#1B2430]",
  ghost: "bg-transparent text-[#596579] hover:bg-[#F3F6FA] hover:text-[#1B2430]",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs rounded-xl",
  md: "px-3.5 py-2 text-sm rounded-xl",
  lg: "px-4 py-2.5 text-base rounded-xl",
  // Phase 4 - Executive Dashboard: a real 44px+ touch target (WCAG minimum),
  // for large touch-friendly buttons on phones (Call/WhatsApp/Maps/etc).
  touch: "px-5 py-3 text-base rounded-xl min-h-[48px]",
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
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer select-none",
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
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 select-none",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
    >
      {children}
    </Link>
  );
}
