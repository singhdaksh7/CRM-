import { describe, it, expect, vi } from "vitest";
import {
  buildExactObjectKeyAllowlist,
  dryRunR2Cleanup,
  executeR2Cleanup,
  type ExactObjectKey,
  type R2LikeClient,
} from "./r2-cleanup";
import { REQUIRED_R2_EXECUTE_CONFIRMATION } from "./constants";

const VALID_PROPERTY_IMAGE_KEY = "organizations/org_default/properties/prop-1/images/abc123.webp";
const VALID_DOCUMENT_KEY = "organizations/org_default/leads/lead-1/documents/def456.pdf";

describe("buildExactObjectKeyAllowlist - structural safety", () => {
  it("accepts well-shaped entity-owned keys", () => {
    const { allowlist, rejected } = buildExactObjectKeyAllowlist([VALID_PROPERTY_IMAGE_KEY, VALID_DOCUMENT_KEY]);
    expect(allowlist).toEqual([VALID_PROPERTY_IMAGE_KEY, VALID_DOCUMENT_KEY]);
    expect(rejected).toEqual([]);
  });

  it("rejects a bare organization prefix", () => {
    const { allowlist, rejected } = buildExactObjectKeyAllowlist(["organizations/org_default"]);
    expect(allowlist).toEqual([]);
    expect(rejected[0].key).toBe("organizations/org_default");
  });

  it("rejects any prefix-shaped key (trailing slash)", () => {
    const { allowlist, rejected } = buildExactObjectKeyAllowlist(["organizations/org_default/properties/prop-1/images/"]);
    expect(allowlist).toEqual([]);
    expect(rejected[0].reason).toMatch(/prefix/);
  });

  it("rejects any key containing a wildcard character", () => {
    const { allowlist, rejected } = buildExactObjectKeyAllowlist(["organizations/org_default/properties/*/images/x.webp"]);
    expect(allowlist).toEqual([]);
    expect(rejected[0].reason).toMatch(/wildcard/);
  });

  it("rejects path traversal", () => {
    const { allowlist } = buildExactObjectKeyAllowlist(["organizations/org_default/properties/../../secret/x.webp"]);
    expect(allowlist).toEqual([]);
  });

  it("rejects a would-be branding/logo key - no entity segment named 'branding' or 'logo' exists in the real key shape, so nothing can match it", () => {
    const { allowlist, rejected } = buildExactObjectKeyAllowlist([
      "organizations/org_default/branding/logo.png",
      "organizations/org_default/logo/logo.png",
    ]);
    expect(allowlist).toEqual([]);
    expect(rejected).toHaveLength(2);
  });

  it("rejects a key belonging to a different organization's shape but still validates shape only (organization scoping is the caller's responsibility to only pass its own org's rows) - documents the key still must match the entity-owned shape", () => {
    const { allowlist } = buildExactObjectKeyAllowlist(["organizations/some-other-org/properties/prop-1/images/x.webp"]);
    // Still accepted by shape (this function only enforces SHAPE, not org
    // identity) - the actual org-scoping guarantee comes from the caller
    // only ever gathering keys from org_default-scoped DB rows (see
    // reset.ts's computeDryRunReport, which is the only real producer of
    // candidate keys) - documented here so that guarantee is never assumed
    // to live in this function instead.
    expect(allowlist).toEqual(["organizations/some-other-org/properties/prop-1/images/x.webp"]);
  });

  it("deduplicates repeated keys", () => {
    const { allowlist } = buildExactObjectKeyAllowlist([VALID_PROPERTY_IMAGE_KEY, VALID_PROPERTY_IMAGE_KEY]);
    expect(allowlist).toEqual([VALID_PROPERTY_IMAGE_KEY]);
  });

  it("rejects empty/non-string input defensively", () => {
    const { allowlist, rejected } = buildExactObjectKeyAllowlist(["", ...( [undefined, null] as unknown as string[])]);
    expect(allowlist).toEqual([]);
    expect(rejected.length).toBe(3);
  });
});

describe("R2LikeClient - structurally incapable of a prefix/wildcard/bucket deletion", () => {
  it("has no method other than deleteObject(exact key) - TypeScript would refuse to compile a deleteByPrefix/deleteBucket call", () => {
    const client: R2LikeClient = { deleteObject: vi.fn().mockResolvedValue(undefined) };
    // The only assignable shape is { deleteObject }. Attempting to call
    // `client.deleteBucket()` or `client.deleteByPrefix()` is a compile
    // error, not a runtime check - proven by this file compiling at all
    // (see tsc --noEmit in CI) while only ever calling deleteObject below.
    expect(Object.keys(client)).toEqual(["deleteObject"]);
  });

  it("executeR2Cleanup only ever calls deleteObject, one exact key at a time, never a batch/prefix call", async () => {
    const calls: string[] = [];
    const client: R2LikeClient = {
      deleteObject: async (key) => {
        calls.push(key);
      },
    };
    const { allowlist } = buildExactObjectKeyAllowlist([VALID_PROPERTY_IMAGE_KEY, VALID_DOCUMENT_KEY]);
    await executeR2Cleanup(client, allowlist, { confirm: REQUIRED_R2_EXECUTE_CONFIRMATION });
    expect(calls).toEqual([VALID_PROPERTY_IMAGE_KEY, VALID_DOCUMENT_KEY]);
  });
});

describe("dryRunR2Cleanup - zero deletions", () => {
  it("never calls any delete method - it doesn't even take a client", () => {
    const report = dryRunR2Cleanup([VALID_PROPERTY_IMAGE_KEY, "organizations/org_default/branding/logo.png"]);
    expect(report.wouldDelete).toEqual([VALID_PROPERTY_IMAGE_KEY]);
    expect(report.rejected).toHaveLength(1);
  });
});

describe("executeR2Cleanup - confirmation gate", () => {
  it("deletes nothing when confirm is missing", async () => {
    const deleteObject = vi.fn();
    const { allowlist } = buildExactObjectKeyAllowlist([VALID_PROPERTY_IMAGE_KEY]);
    await expect(executeR2Cleanup({ deleteObject }, allowlist, { confirm: undefined })).rejects.toThrow();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("deletes nothing when confirm is the wrong string", async () => {
    const deleteObject = vi.fn();
    const { allowlist } = buildExactObjectKeyAllowlist([VALID_PROPERTY_IMAGE_KEY]);
    await expect(executeR2Cleanup({ deleteObject }, allowlist, { confirm: "RESET_KP_DEMO_DATA" })).rejects.toThrow();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("reports per-key failures without aborting the rest of the batch", async () => {
    const deleteObject = vi.fn().mockImplementation(async (key: ExactObjectKey) => {
      if (key === VALID_PROPERTY_IMAGE_KEY) throw new Error("network error");
    });
    const { allowlist } = buildExactObjectKeyAllowlist([VALID_PROPERTY_IMAGE_KEY, VALID_DOCUMENT_KEY]);
    const result = await executeR2Cleanup({ deleteObject }, allowlist, { confirm: REQUIRED_R2_EXECUTE_CONFIRMATION });
    expect(result.deleted).toEqual([VALID_DOCUMENT_KEY]);
    expect(result.failed).toEqual([{ key: VALID_PROPERTY_IMAGE_KEY, error: "network error" }]);
  });
});
