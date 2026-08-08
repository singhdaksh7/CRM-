"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";

export function SetupLinkActions({ employeeId, employeeName, initialSetupUrl }: {
  employeeId: string;
  employeeName: string;
  initialSetupUrl?: string;
}) {
  const [setupUrl, setSetupUrl] = useState(initialSetupUrl ?? "");
  const [loading, setLoading] = useState(false);

  async function regenerate() {
    setLoading(true);
    const response = await fetch(`/api/employees/${employeeId}/setup-link`, { method: "POST" });
    setLoading(false);
    const body = await response.json();
    if (!response.ok) return toast.error(body.error ?? "Could not generate setup link");
    setSetupUrl(body.setupUrl);
    toast.success("A new setup link was generated. The old link is invalid.");
  }

  async function copy() {
    await navigator.clipboard.writeText(setupUrl);
    toast.success("Setup link copied");
  }

  const message = `Hi ${employeeName},\n\nYour KP Properties CRM account has been created.\n\nPlease use this secure link to create your password:\n\n${setupUrl}\n\nThis link will expire for security reasons.`;

  return (
    <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">Account setup</p>
        <p className="text-xs text-slate-600">Only a newly generated link can be shown. Links expire after 48 hours.</p>
      </div>
      {setupUrl && <p className="break-all rounded-lg bg-white p-2 text-xs text-slate-600">{setupUrl}</p>}
      <div className="flex flex-wrap gap-2">
        {setupUrl && <Button type="button" variant="secondary" onClick={copy}><Copy className="h-4 w-4" /> Copy Setup Link</Button>}
        {setupUrl && <Button type="button" variant="secondary" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer")}><ExternalLink className="h-4 w-4" /> Open WhatsApp</Button>}
        <Button type="button" onClick={regenerate} loading={loading}><RefreshCw className="h-4 w-4" /> Generate New Link</Button>
      </div>
      <p className="text-xs text-slate-500">WhatsApp opens only when you click it. Nothing is sent automatically.</p>
    </div>
  );
}
