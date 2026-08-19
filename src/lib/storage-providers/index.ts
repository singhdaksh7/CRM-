import { S3StorageProvider } from "./s3";
import { R2StorageProvider } from "./r2";
import { FirebaseStorageProvider } from "./firebase";
import { DisabledStorageProvider } from "./disabled";
import { MockStorageProvider } from "./mock";
import type { StorageProvider } from "./types";

export * from "./types";
export * from "./object-key";
export * from "./validation";
export { MockStorageProvider } from "./mock";

let cachedProvider: StorageProvider | undefined;
/** Shared mock instance so tests can inspect/clear the same in-memory store. */
let sharedMock: MockStorageProvider | undefined;

/**
 * Selects the active provider from STORAGE_PROVIDER. Cached for the process
 * lifetime (each provider class does its own internal client caching too),
 * mirroring src/lib/prisma.ts and src/lib/rate-limit.ts's singleton style.
 */
export function getStorageProvider(): StorageProvider {
  if (cachedProvider) return cachedProvider;
  const selected = (process.env.STORAGE_PROVIDER || "DISABLED").toUpperCase();
  switch (selected) {
    case "S3":
      cachedProvider = new S3StorageProvider();
      break;
    case "R2":
      cachedProvider = new R2StorageProvider();
      break;
    case "FIREBASE":
      cachedProvider = new FirebaseStorageProvider();
      break;
    case "MOCK":
      if (!sharedMock) sharedMock = new MockStorageProvider();
      cachedProvider = sharedMock;
      break;
    default:
      cachedProvider = new DisabledStorageProvider();
  }
  return cachedProvider;
}

/** Test-only escape hatch to reset the cached provider between test cases that toggle STORAGE_PROVIDER. */
export function _resetStorageProviderCacheForTests(): void {
  cachedProvider = undefined;
}

/** Test helper - returns the shared MockStorageProvider when active, or creates one for direct inspection. */
export function _getSharedMockStorageForTests(): MockStorageProvider {
  if (!sharedMock) sharedMock = new MockStorageProvider();
  return sharedMock;
}
