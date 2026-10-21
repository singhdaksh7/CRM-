import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { InstallGuide } from "@/components/pwa/install-guide";

export const metadata = { title: "Install KP CRM" };

/** Self-service for every signed-in role (see SELF_SERVICE_PATHS). Contains no customer data. */
export default async function InstallPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return <InstallGuide />;
}
