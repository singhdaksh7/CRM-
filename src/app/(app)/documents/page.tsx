import { auth } from "@/lib/auth";
import { PermissionState } from "@/components/ui/states";
import { DocumentVaultClient } from "@/components/documents/document-vault-client";

export default async function DocumentsPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (role !== "ADMIN" && role !== "DATA_MANAGER") {
    return <PermissionState title="Document Vault" description="Only Admins and Data Managers can browse the full Document Vault. Ask your Admin if you need access to a specific file." />;
  }

  return <DocumentVaultClient role={role} />;
}
