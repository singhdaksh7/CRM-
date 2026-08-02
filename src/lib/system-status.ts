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

function checkStorage(): StatusCheck {
  const hasCreds = !!(process.env.STORAGE_BUCKET && process.env.STORAGE_ACCESS_KEY_ID && process.env.STORAGE_SECRET_ACCESS_KEY);
  if (hasCreds) {
    const endpoint = process.env.STORAGE_ENDPOINT ? `custom endpoint (${process.env.STORAGE_ENDPOINT})` : "AWS S3";
    return { name: "storage", status: "ok", detail: `S3-compatible storage configured - bucket "${process.env.STORAGE_BUCKET}" via ${endpoint}` };
  }
  return { name: "storage", status: "not_configured", detail: "No file storage provider configured - Document.fileUrl must be pre-uploaded elsewhere (legacy mode)" };
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
  const checks = [await checkDatabase(), checkEnvironment(), checkStorage(), checkEmail(), checkWhatsApp()];
  const overall: CheckStatus = checks.some((c) => c.status === "error") ? "error" : checks.some((c) => c.status === "warn") ? "warn" : "ok";
  return { checks, overall };
}

export async function getReadiness(): Promise<{ ready: boolean; checks: StatusCheck[] }> {
  const checks = [await checkDatabase(), checkEnvironment()];
  return { ready: checks.every((c) => c.status === "ok"), checks };
}
