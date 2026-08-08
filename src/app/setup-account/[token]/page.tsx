import { AccountSetupForm } from "@/components/auth/account-setup-form";

export default async function SetupAccountPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AccountSetupForm token={token} />;
}
