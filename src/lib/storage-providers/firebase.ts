import "server-only";
import { getFirebaseStorage, getFirebaseBucketName, isFirebaseConfigured } from "../firebase-admin";
import { StorageConfigError } from "./types";
import type {
  StorageProvider,
  UploadAuthorizationInput,
  UploadAuthorization,
  VerifyUploadInput,
  StoredObject,
  DownloadAuthorizationInput,
  DownloadAuthorization,
  StorageObjectMetadata,
  StorageHealthResult,
} from "./types";

const DEFAULT_DOWNLOAD_TTL_SECONDS = 300; // 5 minutes - short-lived per Phase 1 spec (5-15 min)

/**
 * Firebase Storage provider - server-mediated only (the "Preferred MVP
 * approach" from the task spec): the browser never talks to Firebase
 * directly and never sees Admin credentials. The upload route receives the
 * file bytes, calls `uploadBuffer`, then the same verification path as S3
 * (verifyUpload) confirms what actually landed in the bucket.
 *
 * Downloads use short-lived v4 signed URLs (google-cloud-storage's signed
 * URL mechanism, exposed through firebase-admin's Storage/Bucket wrapper) -
 * never a permanent public download-token URL.
 */
export class FirebaseStorageProvider implements StorageProvider {
  readonly name = "FIREBASE" as const;

  private bucket() {
    const bucketName = getFirebaseBucketName();
    return getFirebaseStorage().bucket(bucketName);
  }

  async createUploadAuthorization(input: UploadAuthorizationInput): Promise<UploadAuthorization> {
    // Server-mediated: no signed PUT URL handed to the client. The route
    // that calls this immediately follows up with uploadBuffer() once it
    // has the file bytes in hand.
    return {
      method: "SERVER_MEDIATED",
      objectKey: input.objectKey,
      expiresInSeconds: 0,
    };
  }

  async uploadBuffer(objectKey: string, buffer: Buffer, mimeType: string): Promise<StoredObject> {
    const file = this.bucket().file(objectKey);
    await file.save(buffer, {
      contentType: mimeType,
      resumable: false,
      // Object-level ACLs are irrelevant here - see storage.rules, which
      // denies all direct client access. Metadata like cacheControl is
      // intentionally minimal; nothing here is meant to be publicly cached.
      metadata: { contentType: mimeType },
    });
    return { objectKey, sizeBytes: buffer.byteLength, contentType: mimeType };
  }

  async verifyUpload(input: VerifyUploadInput): Promise<StoredObject> {
    const file = this.bucket().file(input.objectKey);
    const [exists] = await file.exists();
    if (!exists) throw new StorageConfigError(`Object not found in Firebase Storage: ${input.objectKey}`);
    const [metadata] = await file.getMetadata();
    return {
      objectKey: input.objectKey,
      sizeBytes: Number(metadata.size ?? 0),
      contentType: metadata.contentType ?? undefined,
    };
  }

  async createDownloadAuthorization(input: DownloadAuthorizationInput): Promise<DownloadAuthorization> {
    const expiresInSeconds = input.expiresInSeconds ?? DEFAULT_DOWNLOAD_TTL_SECONDS;
    const file = this.bucket().file(input.objectKey);
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + expiresInSeconds * 1000,
      ...(input.contentDisposition ? { responseDisposition: input.contentDisposition } : {}),
    });
    return { url, expiresInSeconds };
  }

  async getMetadata(objectKey: string): Promise<StorageObjectMetadata> {
    const file = this.bucket().file(objectKey);
    const [metadata] = await file.getMetadata();
    return {
      objectKey,
      sizeBytes: Number(metadata.size ?? 0),
      contentType: metadata.contentType ?? undefined,
      updatedAt: metadata.updated ? new Date(metadata.updated) : undefined,
    };
  }

  async exists(objectKey: string): Promise<boolean> {
    const file = this.bucket().file(objectKey);
    const [exists] = await file.exists();
    return exists;
  }

  async deleteObject(objectKey: string): Promise<void> {
    const file = this.bucket().file(objectKey);
    await file.delete({ ignoreNotFound: true });
  }

  async checkHealth(): Promise<StorageHealthResult> {
    if (!isFirebaseConfigured()) {
      return { status: "not_configured", detail: "FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY/STORAGE_BUCKET not fully set" };
    }
    try {
      // Cheap check only - existence check on the bucket reference, no
      // write/delete. The deep read/write/delete round-trip is a separate,
      // explicit Admin-only test (see /api/system/storage-health).
      const [exists] = await this.bucket().exists();
      if (!exists) return { status: "error", detail: `Configured bucket "${getFirebaseBucketName()}" does not exist or is not accessible` };
      return { status: "ok", detail: `Firebase Storage bucket "${getFirebaseBucketName()}" is reachable` };
    } catch (err) {
      return { status: "error", detail: err instanceof Error ? err.message : "Firebase Storage health check failed" };
    }
  }
}
