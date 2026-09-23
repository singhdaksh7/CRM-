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
import { getSystemConfig } from "@/lib/system-config";

const LAZY_SWEEP_THROTTLE_SECONDS = 600; // at most once every 10 minutes

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await withTiming("auth", "(app)/layout", () => auth());
  if (!session) redirect("/login");

  const { role } = session.user;
  const organizationId = getOrganizationId(session.user);
  const { employeeDirectoryLabel } = await getSystemConfig(organizationId);

  after(() => {
    runThrottledSweep(organizationId, LAZY_SWEEP_THROTTLE_SECONDS).catch((err) => {
      logger.error("lazy_sweep_failed", { message: err instanceof Error ? err.message : String(err) });
    });
  });

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAFAFA] text-[#09090B]">
      <Sidebar role={role} employeeDirectoryLabel={employeeDirectoryLabel} user={{ name: session.user.name, role }} />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header user={{ name: session.user.name, role }} employeeDirectoryLabel={employeeDirectoryLabel} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 lg:pb-6 bg-[#FAFAFA]">{children}</main>
        <MobileNavigation role={role} />
      </div>
    </div>
  );
}
