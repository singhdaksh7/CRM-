"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal accessible modal - focus trap, Escape to close, backdrop click to
 * close, restores focus to the trigger on close. Used as both a centered
 * dialog and (via `sheet` prop) a full-screen mobile sheet, styled strictly
 * in line with the Stitch Version 1.0 Light design system.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  sheet,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  sheet?: boolean;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerFocusRef.current = document.activeElement as HTMLElement;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    focusable?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")).filter(
        (el) => !el.hasAttribute("disabled")
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      triggerFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn("fixed inset-0 z-50 flex bg-black/40 backdrop-blur-xs motion-reduce:transition-none", sheet ? "items-end sm:items-center sm:justify-center" : "items-center justify-center p-4")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-description" : undefined}
        className={cn(
          "flex max-h-[92vh] flex-col overflow-hidden border border-[#E7ECF2] bg-white shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95",
          sheet ? "w-full rounded-t-2xl sm:w-full sm:max-w-lg sm:rounded-2xl" : cn("w-full rounded-2xl", wide ? "max-w-3xl" : "max-w-md")
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#EFF4FF] px-5 py-4">
          <div>
            <h2 id="dialog-title" className="text-base font-bold text-[#1B2430]">
              {title}
            </h2>
            {description && (
              <p id="dialog-description" className="mt-0.5 text-xs text-[#596579]">
                {description}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="shrink-0 rounded-lg p-1 text-[#8A94A6] hover:bg-[#F3F6FA] hover:text-[#1B2430]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
