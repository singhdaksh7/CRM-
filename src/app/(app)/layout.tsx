import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { runThrottledSweep } from "@/lib/notifications";
import { getOrganizationId } from "@/lib/organization";
import { withTiming } from "@/lib/perf";
import { logger } from "@/lib/logger";

const LAZY_SWEEP_THROTTLE_SECONDS = 600; // at most once every 10 minutes

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await withTiming("auth", "(app)/layout", () => auth());
  if (!session) redirect("/login");

  const { role, id } = session.user;
  const organizationId = getOrganizationId(id);

  after(() => {
    runThrottledSweep(organizationId, LAZY_SWEEP_THROTTLE_SECONDS).catch((err) => {
      logger.error("lazy_sweep_failed", { message: err instanceof Error ? err.message : String(err) });
    });
  });

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAFBFC] text-[#1B2430]">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={{ name: session.user.name, role }} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 lg:pb-6">{children}</main>
        <MobileNavigation role={role} />
      </div>
    </div>
  );
}
