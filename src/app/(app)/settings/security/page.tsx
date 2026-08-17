import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { formatLastLogin } from "@/lib/last-login";

export const metadata = { title: "Security" };

/**
 * Every signed-in employee's own security page, not an admin screen - the
 * /settings nav entry is ADMIN-only but this child path is explicitly
 * self-service (see SELF_SERVICE_PATHS in src/lib/permissions.ts).
 *
 * Only the signed-in user's own row is read, and the select list is limited
 * to non-secret columns, so no credential material ever reaches this
 * component.
 */
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
      <div className="border-b border-[#E7ECF2] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">Security</h1>
        <p className="mt-1 text-sm text-[#596579]">Manage the password you use to sign in to the CRM.</p>
      </div>

      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF4FF] text-[#3366FF]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#1B2430]">Change Password</h2>
            <p className="text-xs text-[#8A94A6]">Signing in as {user.email} · Last sign-in {formatLastLogin(user.lastLoginAt)}</p>
          </div>
        </div>
        <ChangePasswordForm email={user.email} />
        <p className="mt-4 text-xs text-[#8A94A6]">
          Updating your password signs you out everywhere else. This device stays signed in.
        </p>
      </div>
    </div>
  );
}
