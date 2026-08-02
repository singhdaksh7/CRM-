import { ApiError } from "./api-auth";

/**
 * Shared-secret check for the mock 99acres/Magicbricks lead-notification
 * webhooks. If the corresponding *_API_KEY env var is set, the request must
 * present it via `x-api-key`; if it's unset (the local/mock default), the
 * endpoint stays open - documented behavior for the MVP, not a bug - but any
 * production deployment must set these before exposing the routes publicly.
 */
export function requireWebhookApiKey(req: Request, envVarName: string) {
  const expected = process.env[envVarName];
  if (!expected) return; // No key configured - mock mode, intentionally open.
  const provided = req.headers.get("x-api-key");
  if (provided !== expected) throw new ApiError(401, "Invalid or missing x-api-key");
}
