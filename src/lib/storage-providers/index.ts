import { S3StorageProvider } from "./s3";
import { FirebaseStorageProvider } from "./firebase";
import { DisabledStorageProvider } from "./disabled";
import type { StorageProvider } from "./types";

export * from "./types";
export * from "./object-key";
export * from "./validation";

let cachedProvider: StorageProvider | undefined;

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
    case "FIREBASE":
      cachedProvider = new FirebaseStorageProvider();
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
