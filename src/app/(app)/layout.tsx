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

  // The due/overdue follow-up sweep used to run synchronously here on every
  // navigation (see git history) - that blocked every page transition on an
  // N+1 query loop. It's now primarily driven by Vercel Cron (see
  // vercel.json, POST/GET /api/internal/notifications/sweep). This is a
  // fallback for when cron hasn't fired recently (e.g. a plan that only
  // supports daily cron): scheduled via `after()` so it runs once the
  // response has already been sent to the browser, never delaying
  // rendering, and throttled via Redis to at most once every 10 minutes.
  after(() => {
    runThrottledSweep(organizationId, LAZY_SWEEP_THROTTLE_SECONDS).catch((err) => {
      logger.error("lazy_sweep_failed", { message: err instanceof Error ? err.message : String(err) });
    });
  });

  return (
    <div className="flex h-screen overflow-hidden bg-[#0D1017] text-[#F8FAFC]">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={{ name: session.user.name, role }} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 lg:pb-6">{children}</main>
        <MobileNavigation role={role} />
      </div>
    </div>
  );
}
