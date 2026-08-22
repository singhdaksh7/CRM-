"use client";

import { useState } from "react";
import { Phone, MessageSquare, ChevronDown } from "lucide-react";

export interface PhoneOption {
  label: string; // "Primary", "Office", "Personal", etc.
  number: string;
  isPrimary: boolean;
}

const BUTTON_CLASSES = "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white shadow-xs transition-colors";

/**
 * simplified-role-workflow (continuation pass, spec item 6/7) - Call/WhatsApp
 * number picker. A single number acts immediately via a real tel:/wa.me link
 * (unchanged behavior, and deliberately a real `<a>` rather than a JS
 * `window.location` navigation - the React Compiler's immutability lint
 * rejects assigning `window.location.href` from inside a component); more
 * than one number shows a small selector first, whose entries are
 * themselves real links for the same reason.
 *
 * WhatsApp gap, reported rather than papered over: the in-app conversation
 * panel (src/components/whatsapp/conversation-panel.tsx) and
 * findOrCreateConversation() (src/lib/whatsapp-conversations.ts) are hard-
 * wired to Lead.phone - there is no UI for switching which number an
 * in-app conversation targets, even though the WhatsAppConversation table
 * itself is already keyed `@@unique([leadId, phoneNumber])` and could
 * support it. Wiring a real in-app multi-number switcher would need a
 * conversation-list/picker in conversation-panel.tsx and an explicit
 * phoneNumber param threaded through findOrCreateConversation - real work,
 * not done here per the "implement only where safe" instruction. What IS
 * safe and implemented: the picker below opens the in-app panel for the
 * PRIMARY number only (existing send flow, untouched); for any ALTERNATE
 * number it links to `https://wa.me/<number>` instead - fully manual (the
 * person still has to type and press send themselves), never wired into
 * findOrCreateConversation, so nothing about the existing conversation
 * architecture is touched or risked.
 */
export function LeadPhonePicker({
  phones,
  action,
  onCall,
  onOpenWhatsAppPanel,
}: {
  phones: PhoneOption[];
  action: "call" | "whatsapp";
  onCall: (number: string) => void;
  onOpenWhatsAppPanel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isWhatsApp = action === "whatsapp";
  const Icon = isWhatsApp ? MessageSquare : Phone;
  const label = isWhatsApp ? "WhatsApp" : "Call";
  const colorClass = isWhatsApp ? "bg-[#25D366] hover:bg-[#20bd5a]" : "bg-[#1FA971] hover:bg-[#188457]";

  function entryFor(phone: PhoneOption) {
    if (isWhatsApp && phone.isPrimary) {
      return (
        <button type="button" onClick={() => { setOpen(false); onOpenWhatsAppPanel(); }} className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-[#F3F6FA]">
          <span className="font-semibold text-[#1B2430]">{phone.label}</span>
          <span className="text-xs text-[#8A94A6]">{phone.number}</span>
        </button>
      );
    }
    const href = isWhatsApp ? `https://wa.me/${phone.number.replace(/\D/g, "")}` : `tel:${phone.number}`;
    return (
      <a
        href={href}
        target={isWhatsApp ? "_blank" : undefined}
        rel={isWhatsApp ? "noreferrer" : undefined}
        onClick={() => { setOpen(false); if (!isWhatsApp) onCall(phone.number); }}
        className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-[#F3F6FA]"
      >
        <span className="font-semibold text-[#1B2430]">{phone.label}</span>
        <span className="text-xs text-[#8A94A6]">{phone.number}</span>
      </a>
    );
  }

  if (phones.length <= 1) {
    const only = phones[0];
    if (!only) return null;
    if (isWhatsApp && only.isPrimary) {
      return (
        <button type="button" onClick={onOpenWhatsAppPanel} className={`${BUTTON_CLASSES} ${colorClass}`}>
          <Icon className="h-4 w-4" /> {label}
        </button>
      );
    }
    const href = isWhatsApp ? `https://wa.me/${only.number.replace(/\D/g, "")}` : `tel:${only.number}`;
    return (
      <a
        href={href}
        target={isWhatsApp ? "_blank" : undefined}
        rel={isWhatsApp ? "noreferrer" : undefined}
        onClick={() => !isWhatsApp && onCall(only.number)}
        className={`${BUTTON_CLASSES} ${colorClass}`}
      >
        <Icon className="h-4 w-4" /> {label}
      </a>
    );
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={`${BUTTON_CLASSES} ${colorClass}`}>
        <Icon className="h-4 w-4" /> {label} <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-[#E7ECF2] bg-white p-1.5 shadow-lg">
            {phones.map((p) => <div key={p.number}>{entryFor(p)}</div>)}
          </div>
        </>
      )}
    </div>
  );
}
