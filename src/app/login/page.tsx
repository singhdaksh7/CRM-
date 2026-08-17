"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "sonner";

/**
 * One-time banners the login page understands, all driven by a query
 * parameter the previous flow redirected with. The parameter is stripped from
 * the URL once shown so a refresh (or a shared screenshot of the address bar)
 * doesn't repeat it.
 */
const FLASH_MESSAGES: Record<string, string> = {
  setup: "Password created successfully. You can now sign in.",
  reset: "Password updated successfully. Please sign in.",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, message] of Object.entries(FLASH_MESSAGES)) {
      if (params.get(key) === "success") {
        toast.success(message);
        window.history.replaceState(null, "", "/login");
        break;
      }
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setLoading(false);
      // Deliberately identical for an unknown email, a wrong password, a
      // pending account and a disabled one - the server can't tell us which
      // it was, and the user must not learn it either.
      toast.error("Invalid email or password.");
      return;
    }
    toast.success("Welcome back!");
    // Phase 4 - Field Executives land on their own mobile-first dashboard;
    // everyone else keeps the shared /dashboard. Old bookmarks to /dashboard
    // still work - proxy.ts bounces a FIELD_EXECUTIVE visiting it onward.
    const freshSession = await getSession();
    // Left loading through the redirect on purpose: re-enabling the button
    // here would let an impatient double-tap fire a second sign-in.
    router.push(freshSession?.user?.role === "FIELD_EXECUTIVE" ? "/executive-dashboard" : "/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-[#FAFBFC] px-4 py-8 text-[#1B2430]">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3366FF] text-white font-bold text-2xl shadow-lg shadow-[#3366FF]/20">
            KP
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">Welcome back, Bhaiya</h1>
          <p className="mt-2 text-sm text-[#596579]">Sign in to manage today’s leads, visits, and client follow-ups.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-[#E7ECF2] bg-white p-6 sm:p-8 shadow-xs">
          <Field label="Email Address">
            <Input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              disabled={loading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@delhibrokercrm.com"
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              required
              autoComplete="current-password"
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" loading={loading} disabled={loading} className="w-full justify-center text-sm py-2.5 font-semibold">
            Sign In to CRM
          </Button>
          <p className="text-center text-sm">
            <Link href="/forgot-password" className="font-semibold text-[#3366FF] hover:underline">
              Forgot Password?
            </Link>
          </p>
        </form>

      </div>
    </div>
  );
}
