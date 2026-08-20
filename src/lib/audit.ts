import { prisma } from "./prisma";
import { resolveOrganizationIdForUser, DEFAULT_ORGANIZATION_ID } from "./organization";
import type { AuditAction, AuditResult } from "@prisma/client";

const REDACTED_FIELDS = new Set([
  "passwordhash", "password", "otp", "token", "secret", "accesstoken", "verifytoken", "appsecret",
  "aadhaar", "pan", "panno", "aadhaarnumber",
]);

/** Strips fields that should never be persisted into an audit trail, even as a "what changed" snapshot. */
export function redact(values: Record<string, unknown> | null | undefined): Record<string, unknown> | null | undefined {
  if (!values) return values;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    out[key] = REDACTED_FIELDS.has(key.toLowerCase()) ? "[REDACTED]" : value;
  }
  return out;
}

/**
 * Records an audit trail entry. IP/device are placeholders (`null`) until the
 * app runs behind infra that forwards real client IP/user-agent - the schema
 * and this call site are ready for that without another migration.
 */
export async function recordAudit(params: {
  userId?: string | null;
  /** Pass this whenever the caller already resolved it (e.g. from the
   * session) - avoids the extra lookup below. Falls back to resolving from
   * userId, and only as a last resort (system-triggered entries with
   * neither) to DEFAULT_ORGANIZATION_ID, so audit logging itself never
   * throws and blocks the operation it's recording. */
  organizationId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  result?: AuditResult;
  errorMessage?: string | null;
  ipAddress?: string | null;
  device?: string | null;
}) {
  const organizationId =
    params.organizationId ??
    (params.userId ? await resolveOrganizationIdForUser(params.userId).catch(() => DEFAULT_ORGANIZATION_ID) : DEFAULT_ORGANIZATION_ID);
  return prisma.auditLog.create({
    data: {
      organizationId,
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      oldValues: params.oldValues ? JSON.stringify(redact(params.oldValues)) : null,
      newValues: params.newValues ? JSON.stringify(redact(params.newValues)) : null,
      ipAddress: params.ipAddress ?? null,
      device: params.device ?? null,
      result: params.result ?? "SUCCESS",
      errorMessage: params.errorMessage ?? null,
    },
  });
}
