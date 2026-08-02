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

const NOT_CONFIGURED_MESSAGE = "File storage is not configured on this deployment - set STORAGE_PROVIDER to S3 or FIREBASE (see .env.example / DEPLOYMENT.md 'File Storage')";

/**
 * Default provider when STORAGE_PROVIDER is unset or DISABLED. Every
 * operation fails clearly and safely rather than the app crashing or
 * silently no-op'ing - upload/download routes turn this into a clean 503,
 * and every other CRM page that doesn't touch files keeps working.
 */
export class DisabledStorageProvider implements StorageProvider {
  readonly name = "DISABLED" as const;

  async createUploadAuthorization(_input: UploadAuthorizationInput): Promise<UploadAuthorization> {
    throw new StorageConfigError(NOT_CONFIGURED_MESSAGE);
  }

  async verifyUpload(_input: VerifyUploadInput): Promise<StoredObject> {
    throw new StorageConfigError(NOT_CONFIGURED_MESSAGE);
  }

  async createDownloadAuthorization(_input: DownloadAuthorizationInput): Promise<DownloadAuthorization> {
    throw new StorageConfigError(NOT_CONFIGURED_MESSAGE);
  }

  async getMetadata(_objectKey: string): Promise<StorageObjectMetadata> {
    throw new StorageConfigError(NOT_CONFIGURED_MESSAGE);
  }

  async deleteObject(_objectKey: string): Promise<void> {
    throw new StorageConfigError(NOT_CONFIGURED_MESSAGE);
  }

  async checkHealth(): Promise<StorageHealthResult> {
    return { status: "not_configured", detail: "No file storage provider configured (STORAGE_PROVIDER=DISABLED or unset) - Document.fileUrl must be pre-uploaded elsewhere (legacy mode)" };
  }
}
