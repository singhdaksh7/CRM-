"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";

export function ChangePasswordForm({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCurrentPassword("");
    setPassword("");
    setConfirmPassword("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const response = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, password, confirmPassword }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSaving(false);
      setError(
        body.error === "Validation failed"
          ? "Check that both new password fields match and contain 8–128 characters."
          : body.error ?? "Could not update your password"
      );
      return;
    }

    // Changing the password bumps authVersion, which revokes every session
    // issued before this moment - including this browser's. Re-authenticating
    // with the password just set mints a fresh token carrying the new
    // version, so the user stays signed in here while other devices are
    // signed out. This is why the plaintext is kept in state until now.
    const signedIn = await signIn("credentials", { email, password, redirect: false });
    setSaving(false);
    reset();
    if (signedIn?.error) {
      toast.success("Password updated. Please sign in again with your new password.");
      window.location.assign("/login?reset=success");
      return;
    }
    toast.success("Password updated. Other devices have been signed out.");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Field label="Current Password">
        <PasswordInput
          autoComplete="current-password"
          required
          disabled={saving}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </Field>
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
      <Field label="Confirm New Password">
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
      <Button type="submit" loading={saving} disabled={saving} className="w-full justify-center py-2.5 text-sm font-semibold sm:w-auto">
        Update Password
      </Button>
    </form>
  );
}
