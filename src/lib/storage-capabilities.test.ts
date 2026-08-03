import { describe, it, expect, vi, afterEach } from "vitest";

const ORIGINAL_PROVIDER = process.env.STORAGE_PROVIDER;

afterEach(() => {
  if (ORIGINAL_PROVIDER === undefined) delete process.env.STORAGE_PROVIDER;
  else process.env.STORAGE_PROVIDER = ORIGINAL_PROVIDER;
});

/** getStorageProvider() caches a singleton at module scope keyed off STORAGE_PROVIDER read at first call - vi.resetModules() forces a fresh singleton per test so each one reflects the env var it just set. */
async function freshDTO() {
  vi.resetModules();
  const { getStorageCapabilitiesDTO } = await import("./storage-capabilities");
  return getStorageCapabilitiesDTO();
}

describe("getStorageCapabilitiesDTO", () => {
  it("reports uploads disabled and provider DISABLED when unset", async () => {
    delete process.env.STORAGE_PROVIDER;
    const dto = await freshDTO();
    expect(dto.provider).toBe("DISABLED");
    expect(dto.configured).toBe(false);
    expect(dto.uploadsEnabled).toBe(false);
    expect(dto.propertyImages.enabled).toBe(false);
    expect(dto.documents.enabled).toBe(false);
  });

  it("reports uploads enabled when STORAGE_PROVIDER=FIREBASE", async () => {
    process.env.STORAGE_PROVIDER = "FIREBASE";
    const dto = await freshDTO();
    expect(dto.provider).toBe("FIREBASE");
    expect(dto.configured).toBe(true);
    expect(dto.uploadsEnabled).toBe(true);
  });

  it("reports uploads enabled when STORAGE_PROVIDER=R2", async () => {
    process.env.STORAGE_PROVIDER = "R2";
    const dto = await freshDTO();
    expect(dto.provider).toBe("R2");
    expect(dto.configured).toBe(true);
    expect(dto.uploadsEnabled).toBe(true);
  });

  it("never leaks bucket/project/credential fields", async () => {
    process.env.STORAGE_PROVIDER = "FIREBASE";
    const dto = await freshDTO();
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toMatch(/bucket|project|credential|secret/i);
  });

  it("returns real, non-empty mime allowlists and byte limits", async () => {
    const dto = await freshDTO();
    expect(dto.propertyImages.allowedMimeTypes.length).toBeGreaterThan(0);
    expect(dto.documents.allowedMimeTypes.length).toBeGreaterThan(0);
    expect(dto.propertyImages.maxSizeBytes).toBeGreaterThan(0);
    expect(dto.documents.maxSizeBytes).toBeGreaterThan(0);
  });
});
