import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENV_KEYS = ["MAPS_PROVIDER", "GOOGLE_MAPS_SERVER_API_KEY", "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY"] as const;
let saved: Partial<Record<(typeof ENV_KEYS)[number], string>>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function freshDTO() {
  vi.resetModules();
  const { getMapsCapabilitiesDTO } = await import("./maps-capabilities");
  return getMapsCapabilitiesDTO();
}

describe("getMapsCapabilitiesDTO", () => {
  it("reports DISABLED and not configured by default", async () => {
    const dto = await freshDTO();
    expect(dto.provider).toBe("DISABLED");
    expect(dto.configured).toBe(false);
  });

  it("reports GOOGLE and configured once selected with a key", async () => {
    process.env.MAPS_PROVIDER = "GOOGLE";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "server-secret-key";
    const dto = await freshDTO();
    expect(dto.provider).toBe("GOOGLE");
    expect(dto.configured).toBe(true);
  });

  it("never leaks the server or browser key values, only presence", async () => {
    process.env.MAPS_PROVIDER = "GOOGLE";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "server-secret-key";
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY = "browser-secret-key";
    const dto = await freshDTO();
    expect(dto.browserKeyConfigured).toBe(true);
    expect(JSON.stringify(dto)).not.toContain("server-secret-key");
    expect(JSON.stringify(dto)).not.toContain("browser-secret-key");
  });
});
