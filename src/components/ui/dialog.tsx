"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal accessible modal - focus trap, Escape to close, backdrop click to
 * close, restores focus to the trigger on close. Used as both a centered
 * dialog and (via `sheet` prop) a full-screen mobile sheet, since the
 * project has no existing Dialog/Sheet primitive to build on.
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
      className={cn("fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm motion-reduce:transition-none", sheet ? "items-end sm:items-center sm:justify-center" : "items-center justify-center p-4")}
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
          "flex max-h-[92vh] flex-col overflow-hidden border border-[rgba(255,255,255,0.1)] bg-[#181E2A] shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95",
          sheet ? "w-full rounded-t-2xl sm:w-full sm:max-w-lg sm:rounded-2xl" : cn("w-full rounded-xl", wide ? "max-w-3xl" : "max-w-md")
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[rgba(255,255,255,0.08)] px-5 py-4">
          <div>
            <h2 id="dialog-title" className="text-base font-bold text-[#F8FAFC]">
              {title}
            </h2>
            {description && (
              <p id="dialog-description" className="mt-0.5 text-xs text-[#94A3B8]">
                {description}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="shrink-0 rounded-md p-1 text-[#94A3B8] hover:bg-[#1E2533] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
