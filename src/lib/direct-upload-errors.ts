/** Safe direct-to-storage failure text - status only, never the signed URL/signature. */
export function describeDirectUploadFailure(status: number): string {
  if (status === 0) return "Upload failed before a storage response (often CORS or a blocked network request). Please try again.";
  if (status === 403) return `Direct upload failed (${status}) - signature or checksum mismatch. Please retry.`;
  if (status === 400) return `Direct upload failed (${status}) - storage rejected the upload request. Please retry.`;
  return `Direct upload failed (${status}). Please try again.`;
}
