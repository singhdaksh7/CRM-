"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/form";
import { toast } from "sonner";

const DEMO_ACCOUNTS = [
  { role: "Admin", email: "admin@delhibrokercrm.com", password: "Admin@123" },
  { role: "Data Manager", email: "kanchan@delhibrokercrm.com", password: "Kanchan@123" },
  { role: "Field Executive", email: "sagar@delhibrokercrm.com", password: "Sagar@123" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("setup") === "success") {
      toast.success("Password created successfully. You can now sign in.");
      window.history.replaceState(null, "", "/login");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      toast.error("Invalid email or password");
      return;
    }
    toast.success("Welcome back!");
    // Phase 4 - Field Executives land on their own mobile-first dashboard;
    // everyone else keeps the shared /dashboard. Old bookmarks to /dashboard
    // still work - proxy.ts bounces a FIELD_EXECUTIVE visiting it onward.
    const freshSession = await getSession();
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
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@delhibrokercrm.com" />
          </Field>
          <Field label="Password">
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
          <Button type="submit" loading={loading} className="w-full justify-center text-sm py-2.5 font-semibold">
            Sign In to CRM
          </Button>
        </form>

        <div className="mt-6 rounded-2xl border border-[#E7ECF2] bg-[#F5F7FA] p-4 text-xs text-[#596579]">
          <p className="mb-2 font-semibold uppercase tracking-wider text-[#8A94A6]">Quick Sign-In Demo Roles</p>
          <div className="space-y-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(a.password);
                }}
                className="flex w-full items-center justify-between rounded-xl p-2 hover:bg-[#F3F6FA] transition-colors text-left"
              >
                <span className="font-semibold text-[#1B2430]">{a.role}</span>
                <span className="font-mono text-[#8A94A6]">{a.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
