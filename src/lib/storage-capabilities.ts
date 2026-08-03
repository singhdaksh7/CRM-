import { isStorageConfigured, activeStorageProviderName, MAX_PROPERTY_IMAGE_BYTES, MAX_DOCUMENT_BYTES, IMAGE_MIME_TYPES, DOCUMENT_MIME_TYPES } from "./storage";

export interface StorageCapabilitiesDTO {
  provider: "FIREBASE" | "S3" | "DISABLED";
  configured: boolean;
  uploadsEnabled: boolean;
  propertyImages: { enabled: boolean; maxSizeBytes: number; allowedMimeTypes: string[] };
  documents: { enabled: boolean; maxSizeBytes: number; allowedMimeTypes: string[] };
}

/**
 * Safe, non-sensitive capability DTO - separated from the route handler so
 * it's testable without pulling in next-auth (see GET
 * /api/system/storage-capabilities, which is just requireSession() + this).
 * Deliberately excludes bucket names, project ids, credentials, and object
 * keys - see /api/system/status for the Admin-only deep view.
 */
export function getStorageCapabilitiesDTO(): StorageCapabilitiesDTO {
  const configured = isStorageConfigured();
  const provider = activeStorageProviderName();

  return {
    provider,
    configured,
    uploadsEnabled: configured,
    propertyImages: { enabled: configured, maxSizeBytes: MAX_PROPERTY_IMAGE_BYTES, allowedMimeTypes: [...IMAGE_MIME_TYPES] },
    documents: { enabled: configured, maxSizeBytes: MAX_DOCUMENT_BYTES, allowedMimeTypes: [...DOCUMENT_MIME_TYPES] },
  };
}
