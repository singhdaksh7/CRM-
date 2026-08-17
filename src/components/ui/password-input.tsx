"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./form";
import { cn } from "@/lib/utils";

/**
 * Password field with a show/hide toggle.
 *
 * Shared by login, account setup, password reset and the change-password
 * form so all four behave identically on a phone - these screens are mostly
 * opened from a WhatsApp link on mobile, where mistyping a long password
 * into a masked field is the single most common way people get stuck.
 */
export function PasswordInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const describedBy = useId();

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        id={describedBy}
        // 44px tap target - comfortably thumb-sized on a phone.
        className="absolute inset-y-0 right-0 flex h-full w-11 items-center justify-center rounded-r-xl text-[#8A94A6] transition-colors hover:text-[#1B2430] focus:outline-none focus-visible:text-[#3366FF]"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
