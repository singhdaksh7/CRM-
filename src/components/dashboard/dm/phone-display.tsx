"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * simplified-data-manager-workflow - HARD business requirement: the Data
 * Manager works from a laptop and must see the number as plain text, never
 * a `tel:` link (which would try to open a phone dialer). This component is
 * the ONLY way the phone number is rendered in the simplified DM interface -
 * never use an `<a href="tel:...">` alongside/instead of it here.
 */
export function PhoneDisplay({ phone, className }: { phone: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser - the number is still
      // visible as plain text, so this is never a blocking failure.
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold text-[#1B2430]", className)}>
      <span aria-label={`Phone number ${phone}`}>{phone}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Phone number copied" : "Copy phone number"}
        title="Copy number"
        className="inline-flex items-center gap-1 rounded-lg border border-[#E7ECF2] px-1.5 py-0.5 text-[10px] font-semibold text-[#596579] hover:bg-[#F3F6FA]"
      >
        {copied ? <Check className="h-3 w-3 text-[#25D366]" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
