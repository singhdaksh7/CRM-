"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function AccountSetupForm({ token }: { token: string }) {
  const [state, setState] = useState<{ loading: boolean; valid: boolean; firstName?: string; error?: string }>({ loading: true, valid: false });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/account-setup/${encodeURIComponent(token)}`)
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => setState(response.ok ? { loading: false, valid: true, firstName: body.firstName } : { loading: false, valid: false, error: body.error }))
      .catch(() => setState({ loading: false, valid: false, error: "Could not validate this setup link" }));
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch(`/api/account-setup/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, confirmPassword }),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) return setState((current) => ({ ...current, error: body.error === "Validation failed" ? "Check that both passwords match and contain at least 8 characters." : body.error }));
    window.location.assign("/login?setup=success");
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-4 py-8">
    <div className="w-full max-w-md rounded-2xl border border-[#E4E4E7] bg-white p-6 shadow-xs sm:p-8">
      <div className="mb-6 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0A0A0A] text-xl font-bold text-white shadow-xs">KP</div><h1 className="text-xl font-bold text-[#09090B]">Create your CRM password</h1></div>
      {state.loading ? <p className="text-center text-sm text-[#71717A]">Validating secure link…</p> : !state.valid ? <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.error ?? "This setup link is invalid or has expired."}</div> : <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-[#52525B]">Hi {state.firstName}, choose a password to activate your account.</p>
        {state.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
        <Field label="New Password" hint="8–128 characters"><Input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Confirm Password"><Input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
        <Button className="w-full justify-center" type="submit" loading={saving}>Create Password</Button>
      </form>}
    </div>
  </main>;
}
