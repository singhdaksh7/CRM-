import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { generateDueFollowUpNotifications, getUnreadCount } from "@/lib/notifications";
import { getOrganizationId } from "@/lib/organization";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { role, id } = session.user;
  const organizationId = getOrganizationId(id);

  await generateDueFollowUpNotifications(organizationId);
  const notificationCount = await getUnreadCount(id, role);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0D1017] text-[#F8FAFC]">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={{ name: session.user.name, role }} notificationCount={notificationCount} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 lg:pb-6">{children}</main>
        <MobileNavigation role={role} />
      </div>
    </div>
  );
}
