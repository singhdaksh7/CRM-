"use client";

import { Phone, MessageCircle, Navigation, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

// Change 1 - no custom Maps navigation is built here. This is a plain deep
// link to Google Maps' web/app directions URL - the OS/browser handles
// opening the actual Maps app. No routing, no distance calculation.
function mapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// Minimal local sanitizer (not the full WhatsApp integration's
// normalizeIndianPhone, which is a server-side module) - just enough to turn
// a stored phone string into a wa.me-compatible digit string for a client-side deep link.
function toWhatsAppDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function QuickActionButton({ href, icon: Icon, label, tone = "default", onActivate }: { href: string; icon: typeof Phone; label: string; tone?: "default" | "whatsapp"; onActivate?: () => void }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick={onActivate}
      className={cn(
        "flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-semibold transition active:scale-95",
        tone === "whatsapp" ? "border-[#25D366]/30 bg-[#25D366]/10 text-[#1a9c4d] hover:bg-[#25D366]/20" : "border-[#E7ECF2] bg-white text-[#1B2430] hover:border-[#3366FF]/40 hover:bg-[#3366FF]/5"
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </a>
  );
}

/**
 * Change 4 - the buttons an executive presses most, on every visit/lead
 * card: Call Client, Call Owner, WhatsApp Client, WhatsApp Owner, Open Maps,
 * Open Catalogue. All plain deep links (tel:/wa.me/maps), no custom logic.
 */
export function QuickActions({
  clientPhone,
  ownerPhone,
  latitude,
  longitude,
  catalogueHref,
  leadId,
}: {
  clientPhone?: string | null;
  ownerPhone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  catalogueHref?: string | null;
  /** Change 13 - when provided, tapping Call Client logs a CALL_INITIATED activity on this lead's timeline. Fire-and-forget, never blocks the phone dialer opening. */
  leadId?: string | null;
}) {
  function logCall() {
    if (!leadId) return;
    fetch(`/api/leads/${leadId}/call-initiated`, { method: "POST" }).catch(() => {});
  }

  return (
    <div className="flex flex-wrap gap-2">
      {clientPhone && <QuickActionButton href={`tel:${clientPhone}`} icon={Phone} label="Call Client" onActivate={logCall} />}
      {clientPhone && <QuickActionButton href={`https://wa.me/${toWhatsAppDigits(clientPhone)}`} icon={MessageCircle} label="WhatsApp Client" tone="whatsapp" />}
      {ownerPhone && <QuickActionButton href={`tel:${ownerPhone}`} icon={Phone} label="Call Owner" onActivate={logCall} />}
      {ownerPhone && <QuickActionButton href={`https://wa.me/${toWhatsAppDigits(ownerPhone)}`} icon={MessageCircle} label="WhatsApp Owner" tone="whatsapp" />}
      {latitude != null && longitude != null && <QuickActionButton href={mapsDirectionsUrl(latitude, longitude)} icon={Navigation} label="Open Maps" />}
      {catalogueHref && <QuickActionButton href={catalogueHref} icon={FolderOpen} label="Open Catalogue" />}
    </div>
  );
}
