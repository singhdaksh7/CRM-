"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { AuthCard } from "./auth-card";

/**
 * The response is the same regardless of whether the account exists, so this
 * form shows the same confirmation for every submission - including when the
 * request itself fails, so a network-level difference can't be used to probe
 * either. The user is never told what happened to their specific email.
 */
const GENERIC_CONFIRMATION = "If an account exists for this email, password reset instructions are available.";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Swallowed on purpose - see the note above.
    }
    setSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AuthCard title="Check with your admin" subtitle="Password reset request received">
        <p className="rounded-xl bg-[#EFF4FF] p-4 text-sm text-[#1B2430]">{GENERIC_CONFIRMATION}</p>
        <p className="mt-4 text-sm text-[#596579]">
          Your administrator sends reset links directly over WhatsApp. If you don’t hear back shortly, contact them.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot your password?" subtitle="Enter the email you use to sign in to the CRM.">
      <form onSubmit={submit} className="space-y-5">
        <Field label="Email Address">
          <Input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            disabled={submitting}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@kpproperties.com"
          />
        </Field>
        <Button type="submit" loading={submitting} disabled={submitting} className="w-full justify-center py-2.5 text-sm font-semibold">
          Request Password Reset
        </Button>
      </form>
    </AuthCard>
  );
}
