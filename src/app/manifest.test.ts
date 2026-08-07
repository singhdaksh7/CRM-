import { describe, it, expect } from "vitest";
import manifest from "./manifest";

describe("PWA manifest", () => {
  it("includes all fields required for installability", () => {
    const m = manifest();
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBeTruthy();
    expect(m.background_color).toBeTruthy();
  });

  it("includes both a 192px and a 512px icon, plus a maskable variant", () => {
    const m = manifest();
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect((m.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("every icon has a resolvable src and a PNG type", () => {
    const m = manifest();
    for (const icon of m.icons ?? []) {
      expect(icon.src).toMatch(/^\/api\/pwa\/icon/);
      expect(icon.type).toBe("image/png");
    }
  });
});
