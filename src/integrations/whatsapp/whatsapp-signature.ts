import { createHmac, timingSafeEqual } from "crypto";

/**
 * Validates Meta's `X-Hub-Signature-256: sha256=<hex>` header against the
 * raw request body using the app secret. Returns false (never throws) on
 * any malformed input so callers can uniformly reject with a 401.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const [scheme, provided] = signatureHeader.split("=");
  if (scheme !== "sha256" || !provided) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
