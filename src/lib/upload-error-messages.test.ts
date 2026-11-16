import { describe, expect, it } from "vitest";
import { friendlyUploadError, isNonRetryableUploadError, NOT_SUPPORTED_MESSAGE, TOO_LARGE_MESSAGE } from "@/lib/upload-error-messages";

describe("friendlyUploadError", () => {
  it("surfaces the server's own 4xx message instead of a generic failure", () => {
    expect(friendlyUploadError(400, { error: "Property already has 25 images (limit 25)" })).toBe("Property already has 25 images (limit 25)");
    expect(friendlyUploadError(403, { error: "Role VIEWER is not permitted to upload property images" })).toMatch(/not permitted/);
    expect(friendlyUploadError(404, { error: "Property not found" })).toBe("Property not found");
  });

  it("maps size / type / rate limit / storage / expiry / session to clear text", () => {
    expect(friendlyUploadError(413, {})).toBe(TOO_LARGE_MESSAGE);
    expect(friendlyUploadError(400, { error: "File is 99 bytes, exceeding the 10485760 byte limit for PROPERTY_IMAGE" })).not.toBe("Upload failed. Please try again.");
    expect(friendlyUploadError(400, { error: 'MIME type "image/gif" is not allowed for PROPERTY_IMAGE' })).toBe(NOT_SUPPORTED_MESSAGE);
    expect(friendlyUploadError(415, {})).toBe(NOT_SUPPORTED_MESSAGE);
    expect(friendlyUploadError(429, {})).toMatch(/too many uploads/i);
    expect(friendlyUploadError(503, {})).toMatch(/not configured/i);
    expect(friendlyUploadError(410, {})).toMatch(/expired/i);
    expect(friendlyUploadError(401, {})).toMatch(/sign in/i);
    expect(friendlyUploadError(502, null)).toMatch(/could not be reached/i);
    expect(friendlyUploadError(400, { error: "Upload not found in storage - the presigned upload may not have completed" })).toMatch(/did not finish/i);
    expect(friendlyUploadError(400, { error: "Uploaded object exceeds authorized size" })).toBe(TOO_LARGE_MESSAGE);
  });

  it("falls back to a generic message for 5xx, validation noise and non-JSON bodies", () => {
    expect(friendlyUploadError(500, { error: "Internal server error", requestId: "x" })).toBe("Upload failed. Please try again.");
    expect(friendlyUploadError(400, { error: "Validation failed", issues: [] })).toBe("Upload failed. Please try again.");
    expect(friendlyUploadError(undefined, undefined)).toBe("Upload failed. Please try again.");
  });

  it("flags only unfixable-by-retry errors as non-retryable", () => {
    expect(isNonRetryableUploadError(NOT_SUPPORTED_MESSAGE)).toBe(true);
    expect(isNonRetryableUploadError(TOO_LARGE_MESSAGE)).toBe(true);
    expect(isNonRetryableUploadError(friendlyUploadError(429, {}))).toBe(false);
    expect(isNonRetryableUploadError(undefined)).toBe(false);
  });
});
