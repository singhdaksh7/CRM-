import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { formatLastLogin } from "@/lib/last-login";

export const metadata = { title: "Security" };

export default async function SecuritySettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, status: true, lastLoginAt: true },
  });
  if (!user || user.status !== "ACTIVE") redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="border-b border-[#E4E4E7] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#09090B]">Account Security</h1>
        <p className="mt-1 text-sm text-[#52525B]">Manage the password you use to sign in to the CRM.</p>
      </div>

      <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FAFAFA] border border-[#E4E4E7] text-[#09090B]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#09090B]">Change Password</h2>
            <p className="text-xs text-[#71717A]">Signing in as {user.email} · Last sign-in {formatLastLogin(user.lastLoginAt)}</p>
          </div>
        </div>
        <ChangePasswordForm email={user.email} />
        <p className="mt-4 text-xs text-[#71717A]">
          Updating your password signs you out everywhere else. This device stays signed in.
        </p>
      </div>
    </div>
  );
}
