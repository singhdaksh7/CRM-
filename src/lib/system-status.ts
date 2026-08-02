import { prisma } from "./prisma";

export type CheckStatus = "ok" | "warn" | "error" | "not_configured";

export interface StatusCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

const REQUIRED_ENV_VARS = ["DATABASE_URL", "AUTH_SECRET", "NEXTAUTH_URL", "NEXT_PUBLIC_APP_URL"];

async function checkDatabase(): Promise<StatusCheck> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: "database", status: "ok", detail: `Reachable (${Date.now() - started}ms)` };
  } catch (err) {
    return { name: "database", status: "error", detail: err instanceof Error ? err.message : "Unreachable" };
  }
}

export function checkEnvironment(): StatusCheck {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) return { name: "environment", status: "error", detail: `Missing: ${missing.join(", ")}` };
  return { name: "environment", status: "ok", detail: "All required environment variables are set" };
}

/**
 * Cheap config-existence check only - no bucket round trip, so this is safe
 * to run on every /api/system/status request. See
 * GET /api/system/storage-health for the Admin-only deep test that
 * actually reads/writes/deletes a temporary object.
 */
async function checkStorage(): Promise<StatusCheck> {
  const { checkStorageHealth, activeStorageProviderName } = await import("./storage");
  const result = await checkStorageHealth();
  const provider = activeStorageProviderName();
  return { name: "storage", status: result.status, detail: `[${provider}] ${result.detail}` };
}

function checkEmail(): StatusCheck {
  if (process.env.SMTP_HOST || process.env.EMAIL_FROM) {
    return { name: "email", status: "ok", detail: "Email provider environment variables detected" };
  }
  return { name: "email", status: "not_configured", detail: "No SMTP/email provider configured" };
}

export function checkWhatsApp(): StatusCheck {
  const provider = (process.env.WHATSAPP_PROVIDER ?? "MOCK").toUpperCase();
  if (provider === "MOCK" || provider === "CLICK_TO_CHAT") {
    return { name: "whatsapp", status: "ok", detail: `Provider ${provider} active (no credentials required)` };
  }
  if (provider === "META_CLOUD") {
    const hasCreds = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_VERIFY_TOKEN);
    return hasCreds
      ? { name: "whatsapp", status: "ok", detail: "META_CLOUD provider configured" }
      : { name: "whatsapp", status: "error", detail: "META_CLOUD selected but missing credentials" };
  }
  return { name: "whatsapp", status: "error", detail: `Unknown WHATSAPP_PROVIDER "${provider}"` };
}

export async function getSystemStatus(): Promise<{ checks: StatusCheck[]; overall: CheckStatus }> {
  const checks = [await checkDatabase(), checkEnvironment(), await checkStorage(), checkEmail(), checkWhatsApp()];
  const overall: CheckStatus = checks.some((c) => c.status === "error") ? "error" : checks.some((c) => c.status === "warn") ? "warn" : "ok";
  return { checks, overall };
}

export async function getReadiness(): Promise<{ ready: boolean; checks: StatusCheck[] }> {
  const checks = [await checkDatabase(), checkEnvironment()];
  return { ready: checks.every((c) => c.status === "ok"), checks };
}
