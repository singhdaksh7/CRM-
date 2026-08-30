import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config";

/**
 * Regression test for the Permissions-Policy geolocation directive.
 * `geolocation=()` (empty allowlist) denies geolocation to every context,
 * including this app's own first-party top-level document - verified
 * against Chromium's document.featurePolicy.allowsFeature, which returns
 * false for `()` and true for `(self)`. That silently broke the
 * FIELD_EXECUTIVE Capture Location button. `(self)` must be used instead so
 * first-party geolocation works while third-party/cross-origin frames stay
 * denied.
 */
describe("Permissions-Policy geolocation directive", () => {
  it("allows first-party (self) geolocation, never a bare/global grant", async () => {
    const headerGroups = await nextConfig.headers!();
    const rootGroup = headerGroups.find((g) => g.source === "/:path*");
    const permissionsPolicy = rootGroup?.headers.find((h) => h.key === "Permissions-Policy");

    expect(permissionsPolicy).toBeDefined();
    expect(permissionsPolicy!.value).toMatch(/geolocation=\(self\)/);
    // Must never regress to a fully-denying empty allowlist...
    expect(permissionsPolicy!.value).not.toMatch(/geolocation=\(\)/);
    // ...or a wildcard/other-origin grant.
    expect(permissionsPolicy!.value).not.toMatch(/geolocation=\(\*\)/);
    expect(permissionsPolicy!.value).not.toContain("geolocation=(self ");
  });
});
