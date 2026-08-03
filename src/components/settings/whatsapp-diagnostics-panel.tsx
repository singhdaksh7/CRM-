"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wifi, Send } from "lucide-react";

interface HealthResult {
  provider: string;
  webhookEnabled: boolean;
  ok: boolean;
  details: Record<string, string>;
  templates: { useCase: string; name: string; category: string; approved: boolean }[];
}

/** Admin-only diagnostics: a safe read-only "Test Connection" check, and an explicit confirmed "Send Test Message" action. Never renders credentials - only what GET/POST already return. */
export function WhatsAppDiagnosticsPanel() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [sending, setSending] = useState(false);

  async function testConnection() {
    setChecking(true);
    try {
      const res = await fetch("/api/system/whatsapp-health", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Connection test failed");
        return;
      }
      setResult(data);
      toast[data.ok ? "success" : "error"](data.ok ? "WhatsApp connection looks good" : "WhatsApp connection test found a problem");
    } finally {
      setChecking(false);
    }
  }

  async function sendTest() {
    setSending(true);
    try {
      const res = await fetch("/api/system/whatsapp-test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Test send failed");
        return;
      }
      toast.success("Test message sent");
    } finally {
      setSending(false);
      setConfirmingSend(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-[rgba(255,255,255,0.06)] pt-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={testConnection} loading={checking}>
          <Wifi className="h-3.5 w-3.5" /> Test Connection
        </Button>
        {!confirmingSend ? (
          <Button size="sm" variant="secondary" onClick={() => setConfirmingSend(true)}>
            <Send className="h-3.5 w-3.5" /> Send Test Message
          </Button>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.08)] px-3 py-1.5">
            <span className="text-xs text-[#F59E0B]">This sends a real message to the configured test recipient. Confirm?</span>
            <Button size="sm" variant="danger" onClick={sendTest} loading={sending}>
              Confirm
            </Button>
            <button onClick={() => setConfirmingSend(false)} className="text-xs text-[#94A3B8] hover:text-white">
              Cancel
            </button>
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-2 text-xs">
          <p className="flex items-center gap-2">
            <span className="text-[#94A3B8]">Result:</span>
            <Badge tone={result.ok ? "green" : "red"}>{result.ok ? "Connected" : "Problem detected"}</Badge>
            <Badge tone={result.webhookEnabled ? "green" : "slate"}>{result.webhookEnabled ? "Webhook enabled" : "Webhook disabled"}</Badge>
          </p>
          {Object.entries(result.details).map(([key, value]) => (
            <p key={key} className="flex justify-between gap-2 text-[#94A3B8]">
              <span className="uppercase tracking-wide">{key}</span>
              <span className="font-medium text-[#CBD5E1]">{value}</span>
            </p>
          ))}
          <div className="pt-1">
            <p className="mb-1 font-semibold text-[#94A3B8]">Templates</p>
            <div className="flex flex-wrap gap-1.5">
              {result.templates.map((t) => (
                <Badge key={t.useCase} tone={t.approved ? "green" : "slate"}>
                  {t.name} {t.approved ? "· Approved" : "· Not confirmed"}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
