import Link from "next/link";

/**
 * Shared shell for the signed-out auth screens (forgot password, reset
 * password). Matches the login/account-setup layout: full-height centred
 * card, generous padding on a phone, `max-w-md` so it never stretches on
 * desktop. These pages are opened from WhatsApp on mobile far more often
 * than from a laptop.
 */
export function AuthCard({ title, subtitle, children, footer }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAFBFC] px-4 py-8 text-[#1B2430]">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#3366FF] text-xl font-bold text-white shadow-lg shadow-[#3366FF]/20">
            KP
          </div>
          <h1 className="text-xl font-bold text-[#1B2430]">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-[#596579]">{subtitle}</p>}
        </div>
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-6 shadow-xs sm:p-8">{children}</div>
        <p className="mt-5 text-center text-sm">
          {footer ?? (
            <Link href="/login" className="font-semibold text-[#3366FF] hover:underline">
              Back to sign in
            </Link>
          )}
        </p>
      </div>
    </main>
  );
}
