"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthCard } from "./auth-card";

/**
 * Mirrors AccountSetupForm: validate the token on mount, then submit the new
 * password. Every token rejection - unknown, expired, already used, deleted
 * user, pending or disabled account - comes back from the API as the same
 * message, and this component renders whatever it is given without adding
 * any distinguishing detail of its own.
 */
const GENERIC_TOKEN_ERROR = "This password reset link is invalid or has expired.";

export function PasswordResetForm({ token }: { token: string }) {
  const [state, setState] = useState<{ loading: boolean; valid: boolean; firstName?: string; error?: string }>({ loading: true, valid: false });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/password-reset/${encodeURIComponent(token)}`)
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) =>
        setState(response.ok
          ? { loading: false, valid: true, firstName: body.firstName }
          : { loading: false, valid: false, error: body.error ?? GENERIC_TOKEN_ERROR })
      )
      .catch(() => setState({ loading: false, valid: false, error: GENERIC_TOKEN_ERROR }));
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch(`/api/password-reset/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, confirmPassword }),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) {
      return setState((current) => ({
        ...current,
        error: body.error === "Validation failed"
          ? "Check that both passwords match and contain at least 8 characters."
          : body.error ?? GENERIC_TOKEN_ERROR,
      }));
    }
    window.location.assign("/login?reset=success");
  }

  if (state.loading) {
    return (
      <AuthCard title="Set a new password">
        <p className="text-center text-sm text-[#596579]">Validating secure link…</p>
      </AuthCard>
    );
  }

  if (!state.valid) {
    return (
      <AuthCard
        title="Link no longer valid"
        footer={<Link href="/forgot-password" className="font-semibold text-[#3366FF] hover:underline">Request a new link</Link>}
      >
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.error ?? GENERIC_TOKEN_ERROR}</div>
        <p className="mt-4 text-sm text-[#596579]">Ask your administrator to generate a fresh password reset link for you.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password" subtitle={state.firstName ? `Hi ${state.firstName}, choose a new password below.` : undefined}>
      <form onSubmit={submit} className="space-y-4">
        {state.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
        <Field label="New Password" hint="8–128 characters">
          <PasswordInput
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            disabled={saving}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm Password">
          <PasswordInput
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            disabled={saving}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>
        <Button className="w-full justify-center py-2.5 text-sm font-semibold" type="submit" loading={saving} disabled={saving}>
          Update Password
        </Button>
      </form>
    </AuthCard>
  );
}
