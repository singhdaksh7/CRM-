/**
 * Human-readable text for a failed property-image API call (upload-url /
 * confirm / multipart fallback). Pure so it is unit-testable.
 *
 * The API routes return `{ error: string }` from ApiError - those messages are
 * written for end users (quota, validation, permission), so 4xx messages are
 * surfaced verbatim instead of being collapsed into a generic failure.
 * Never pass signed URLs or storage keys through here.
 */
export const NOT_SUPPORTED_MESSAGE = "This file type is not supported.";
export const TOO_LARGE_MESSAGE = "The image is larger than the allowed limit.";

/** Messages that retrying cannot fix (the user must pick a different file). */
export function isNonRetryableUploadError(message: string | undefined): boolean {
  return !!message && (message.includes("not supported") || message.includes("larger than"));
}

export function friendlyUploadError(status: number | undefined, body: unknown): string {
  const raw = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? ((body as { error: string }).error) : "";
  const lower = raw.toLowerCase();

  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 413) return TOO_LARGE_MESSAGE;
  if (status === 415 || lower.includes("mime type") || lower.includes("extension")) return NOT_SUPPORTED_MESSAGE;
  if (status === 429) return "Too many uploads in a short time. Wait a minute, then press Retry.";
  if (status === 503) return "File storage is not configured. Contact an administrator.";
  if (status === 410) return "Upload session expired. Please retry.";
  if (status === 502 || status === 504) return "The server could not be reached. Check your connection and retry.";
  if (status === 400 && lower.includes("exceeds") && lower.includes("size")) return TOO_LARGE_MESSAGE;
  if (status === 400 && lower.includes("not found in storage")) return "The image did not finish uploading. Please retry.";
  if (status !== undefined && status >= 400 && status < 500 && raw && lower !== "validation failed") return raw;
  return "Upload failed. Please try again.";
}
