"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
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
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-[#0D1017] px-4 py-8 text-[#F8FAFC]">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4F8CFF] text-[#0D1017] font-bold text-2xl shadow-lg shadow-[#4F8CFF]/20">
            D
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F8FAFC]">Welcome back, Bhaiya</h1>
          <p className="mt-2 text-sm text-[#94A3B8]">Sign in to manage today’s leads, visits, and client follow-ups.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-[rgba(255,255,255,0.14)] bg-[#181E2A] p-6 sm:p-8 shadow-2xl">
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

        <div className="mt-6 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#11151F] p-4 text-xs text-[#94A3B8]">
          <p className="mb-2 font-semibold uppercase tracking-wider text-[#64748B]">Quick Sign-In Demo Roles</p>
          <div className="space-y-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(a.password);
                }}
                className="flex w-full items-center justify-between rounded-lg p-2 hover:bg-[#1E2533] transition-colors text-left"
              >
                <span className="font-semibold text-[#CBD5E1]">{a.role}</span>
                <span className="font-mono text-[#64748B]">{a.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
