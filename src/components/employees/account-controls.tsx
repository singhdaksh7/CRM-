"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, ExternalLink, KeyRound, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupLinkActions } from "./setup-link-actions";

type EmployeeStatus = "PENDING_SETUP" | "ACTIVE" | "INACTIVE";

/**
 * Admin account controls on the employee detail page, keyed off the
 * employee's current status:
 *
 *   PENDING_SETUP - generate/copy/WhatsApp a setup link (existing component)
 *   ACTIVE        - generate a password reset link, or disable the account
 *   INACTIVE      - enable the account
 *
 * Nothing here ever receives or renders a password, a password hash, or a
 * token hash: the only secret that crosses the wire is the freshly minted
 * plaintext reset URL, and only in the response to the click that created it.
 * It lives in component state for that one render pass and is gone on
 * navigation - returning later means generating a new link.
 */
export function EmployeeAccountControls({ employeeId, employeeName, status }: {
  employeeId: string;
  employeeName: string;
  status: EmployeeStatus;
}) {
  if (status === "PENDING_SETUP") {
    return <SetupLinkActions employeeId={employeeId} employeeName={employeeName} />;
  }
  if (status === "ACTIVE") {
    return (
      <div className="space-y-3">
        <ResetLinkActions employeeId={employeeId} employeeName={employeeName} />
        <AccountStatusAction employeeId={employeeId} action="DISABLE" />
      </div>
    );
  }
  return <AccountStatusAction employeeId={employeeId} action="ENABLE" />;
}

function ResetLinkActions({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const [resetUrl, setResetUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    const response = await fetch(`/api/employees/${employeeId}/reset-link`, { method: "POST" });
    setLoading(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(body.error ?? "Could not generate a password reset link");
    setResetUrl(body.resetUrl);
    toast.success("Reset link generated. Any earlier link is now invalid.");
  }

  async function copy() {
    await navigator.clipboard.writeText(resetUrl);
    toast.success("Reset link copied");
  }

  const message = `Hi ${employeeName},\n\nA password reset was requested for your KP Properties CRM account.\n\nUse this secure link to set a new password:\n\n${resetUrl}\n\nThis link expires shortly and can only be used once.`;

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">Password reset</p>
        <p className="text-xs text-slate-600">
          The link is shown once, right after you generate it. It can’t be retrieved later — generate a new one if you lose it.
        </p>
      </div>
      {resetUrl && <p className="break-all rounded-lg bg-white p-2 text-xs text-slate-600">{resetUrl}</p>}
      <div className="flex flex-wrap gap-2">
        {resetUrl && (
          <Button type="button" variant="secondary" onClick={copy}>
            <Copy className="h-4 w-4" /> Copy Reset Link
          </Button>
        )}
        {resetUrl && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-4 w-4" /> Open WhatsApp
          </Button>
        )}
        <Button type="button" onClick={generate} loading={loading}>
          <KeyRound className="h-4 w-4" /> Generate Password Reset Link
        </Button>
      </div>
      <p className="text-xs text-slate-500">WhatsApp opens only when you click it. Nothing is sent automatically.</p>
    </div>
  );
}

function AccountStatusAction({ employeeId, action }: { employeeId: string; action: "DISABLE" | "ENABLE" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const disabling = action === "DISABLE";

  async function submit() {
    setLoading(true);
    const response = await fetch(`/api/employees/${employeeId}/account-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(body.error ?? "Could not update this account");
    toast.success(
      disabling
        ? "Account disabled. Their sessions have been signed out."
        : body.employee?.status === "PENDING_SETUP"
          ? "Account enabled. They still need a setup link to choose a password."
          : "Account enabled."
    );
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] p-4">
      <p className="text-sm font-semibold text-slate-900">{disabling ? "Disable account" : "Enable account"}</p>
      <p className="text-xs text-slate-600">
        {disabling
          ? "Blocks sign-in immediately, signs out every device, and invalidates any outstanding setup or reset link."
          : "Restores access. An employee who never chose a password comes back as Pending Setup, not Active."}
      </p>
      <Button type="button" variant={disabling ? "danger" : "primary"} onClick={submit} loading={loading}>
        {disabling ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
        {disabling ? "Disable Account" : "Enable Account"}
      </Button>
    </div>
  );
}
