import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { WhatsAppInbox } from "@/components/whatsapp/whatsapp-inbox";

export default async function WhatsAppPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return <WhatsAppInbox currentUser={{ id: session.user.id, role: session.user.role }} />;
}
