import { createHash, timingSafeEqual } from "crypto";
import { ApiError } from "./api-auth";

/**
 * Shared-secret check for the mock Magicbricks lead-notification webhook.
 * Fails closed: if the corresponding *_API_KEY env var is unset/blank the
 * request is refused (503), never waved through. A missing environment
 * variable must not be able to turn a lead-ingestion endpoint into an
 * unauthenticated one.
 */
export function requireWebhookApiKey(req: Request, envVarName: string) {
  const expected = process.env[envVarName]?.trim();
  if (!expected) throw new ApiError(503, "Webhook is not configured");
  const provided = req.headers.get("x-api-key") ?? "";
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!provided || !timingSafeEqual(a, b)) throw new ApiError(401, "Invalid or missing x-api-key");
}
