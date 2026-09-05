import { REQUIRED_R2_EXECUTE_CONFIRMATION } from "./constants";

/**
 * R2 object cleanup - a FULLY SEPARATE stage from the DB reset in reset.ts.
 * Never runs inside the DB `$transaction`, never called by executeReset(),
 * and never touches Cloudflare R2 in this task (see the task's hard
 * constraints - no R2 modification of any kind is performed here; this
 * module is code-only, exercised in tests against a fake in-memory client).
 *
 * Structural safety (by construction, not just a runtime check):
 *   - ExactObjectKey is a branded string type. The ONLY way to produce one
 *     is buildExactObjectKeyAllowlist() below, which rejects anything that
 *     isn't a full, specific "organizations/{org}/{entity-segment}/{entity
 *     id}/{sub}/{filename}" key - see object-key.ts's real key shape,
 *     mirrored in ENTITY_OWNED_KEY_PATTERN. A bare org prefix
 *     ("organizations/org_default"), any prefix ending in "/", and any key
 *     containing "*" are all rejected outright - there is no code path that
 *     can turn a prefix/wildcard/bucket-level input into a valid
 *     ExactObjectKey.
 *   - R2LikeClient's only write method is deleteObject(key: ExactObjectKey).
 *     There is deliberately no deleteByPrefix/deleteBucket/listAndDelete
 *     method anywhere on this interface - a caller cannot express "delete
 *     everything under X" through this module even by mistake, because no
 *     function signature accepts anything but one already-validated exact
 *     key at a time.
 *   - Keys are only ever accepted as input from records the caller already
 *     fetched for entities being deleted (property images / documents) -
 *     never derived from a prefix, glob, or the organization id alone - so
 *     the bucket root and "organizations/org_default" itself can never
 *     appear in the resulting allow-list.
 */

declare const ExactKeyBrand: unique symbol;
export type ExactObjectKey = string & { readonly [ExactKeyBrand]: true };

/**
 * Mirrors src/lib/storage-providers/object-key.ts's real key shape exactly:
 * organizations/{orgId}/{properties|leads|owners|deals|payments}/{entityId}/
 * {images|floor-plans|availability-reports|documents|receipts}/{filename}.
 * This schema has no "branding"/"logo" entity segment at all today - so any
 * future branding-asset key (which would need its OWN segment name to be
 * addressable, e.g. "organizations/{org}/branding/...") structurally cannot
 * match this pattern and is rejected below, not by name-sniffing for
 * "logo"/"brand" (a name-based blocklist would rot; a shape-based allowlist
 * cannot admit anything the storage layer doesn't already produce).
 */
const ENTITY_OWNED_KEY_PATTERN =
  /^organizations\/[A-Za-z0-9_-]{1,64}\/(properties|leads|owners|deals|payments)\/[A-Za-z0-9_-]{1,64}\/(images|floor-plans|availability-reports|documents|receipts)\/[^/*]+$/;

export interface AllowlistResult {
  allowlist: ExactObjectKey[];
  rejected: { key: string; reason: string }[];
}

/**
 * The ONLY constructor of ExactObjectKey values. Every input is validated
 * independently - there is no "trust the caller" path.
 */
export function buildExactObjectKeyAllowlist(candidateKeys: readonly string[]): AllowlistResult {
  const allowlist: ExactObjectKey[] = [];
  const rejected: { key: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const rawKey of candidateKeys) {
    if (typeof rawKey !== "string" || rawKey.length === 0) {
      rejected.push({ key: String(rawKey), reason: "empty/non-string" });
      continue;
    }
    if (rawKey.includes("*") || rawKey.includes("?")) {
      rejected.push({ key: rawKey, reason: "contains a wildcard character" });
      continue;
    }
    if (rawKey.endsWith("/")) {
      rejected.push({ key: rawKey, reason: "shaped like a prefix (trailing slash), not an exact object key" });
      continue;
    }
    if (rawKey.includes("..")) {
      rejected.push({ key: rawKey, reason: "contains path traversal" });
      continue;
    }
    if (!ENTITY_OWNED_KEY_PATTERN.test(rawKey)) {
      rejected.push({ key: rawKey, reason: "does not match the known entity-owned object key shape (organizations/{org}/{entity}/{id}/{sub}/{file}) - preserved, not deleted" });
      continue;
    }
    if (seen.has(rawKey)) continue;
    seen.add(rawKey);
    allowlist.push(rawKey as ExactObjectKey);
  }

  return { allowlist, rejected };
}

/**
 * Structurally incapable of a prefix/wildcard/bucket deletion: the only
 * write operation is deleteObject(key: ExactObjectKey) - a single, already-
 * validated exact key. There is intentionally no bucket-level or prefix-
 * level method on this interface at all.
 */
export interface R2LikeClient {
  deleteObject(key: ExactObjectKey): Promise<void>;
}

export interface R2DryRunReport {
  wouldDelete: string[];
  rejected: { key: string; reason: string }[];
}

/** Read-only. Never calls deleteObject. Safe (and the default) to run at any time. */
export function dryRunR2Cleanup(candidateKeys: readonly string[]): R2DryRunReport {
  const { allowlist, rejected } = buildExactObjectKeyAllowlist(candidateKeys);
  return { wouldDelete: allowlist.slice(), rejected };
}

export interface R2ExecuteOptions {
  confirm: string | undefined;
}

export interface R2ExecuteResult {
  deleted: string[];
  failed: { key: string; error: string }[];
}

/**
 * Deletes exactly the pre-built allow-list, one key at a time, against
 * whatever R2LikeClient the caller supplies (never Cloudflare R2 itself in
 * this codebase/tests - see module doc comment). Requires its own explicit
 * confirmation, independent of the DB reset's REQUIRED_EXECUTE_CONFIRMATION.
 */
export async function executeR2Cleanup(
  client: R2LikeClient,
  allowlist: readonly ExactObjectKey[],
  options: R2ExecuteOptions
): Promise<R2ExecuteResult> {
  if (options.confirm !== REQUIRED_R2_EXECUTE_CONFIRMATION) {
    throw new Error(`Refusing to execute R2 cleanup: --confirm must equal exactly "${REQUIRED_R2_EXECUTE_CONFIRMATION}". No objects were deleted.`);
  }
  const deleted: string[] = [];
  const failed: { key: string; error: string }[] = [];
  for (const key of allowlist) {
    try {
      await client.deleteObject(key);
      deleted.push(key);
    } catch (error) {
      failed.push({ key, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { deleted, failed };
}
