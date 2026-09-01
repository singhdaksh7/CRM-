import { z } from "zod";

/**
 * Fail-fast environment validation (Phase 3D). Run once at process startup
 * via instrumentation.ts's `register()` - if a required variable is missing
 * or malformed, the process exits with a clear message instead of the app
 * coming up and failing confusingly on the first request that needs it.
 *
 * Conditional requirements (e.g. META_CLOUD needing WhatsApp credentials)
 * are enforced here too, not just at first use in whatsapp-config.ts - so a
 * misconfigured production deploy is caught before it ever serves traffic.
 */
const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
    // Auth.js v5 derives its origin from the trusted request host on Vercel
    // Preview. Keeping a production URL here for Preview would send users to
    // the production hostname, so it is deliberately optional only there.
    NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL").optional(),
    NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL"),

    WHATSAPP_PROVIDER: z.enum(["MOCK", "CLICK_TO_CHAT", "META_CLOUD"]).default("MOCK"),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    // Required when META_CLOUD is selected - gates webhook signature
    // verification (whatsapp-signature.ts). Without it, meta-whatsapp-provider.ts
    // fails closed (rejects every webhook) rather than silently skipping the check.
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_API_VERSION: z.string().regex(/^v\d+\.\d+$/, 'WHATSAPP_API_VERSION must look like "v20.0"').optional(),
    // Used by phone.ts's normalizeIndianPhone as the prefix applied to bare
    // 10-digit mobile numbers. 1-3 digits, matching real ITU country-code lengths.
    WHATSAPP_DEFAULT_COUNTRY_CODE: z.string().regex(/^\d{1,3}$/, "WHATSAPP_DEFAULT_COUNTRY_CODE must be 1-3 digits").default("91"),
    // Only meaningful for the explicit test-send diagnostic action - never
    // used for any automatic/bulk send. Must be a plausible Indian mobile number.
    WHATSAPP_TEST_RECIPIENT: z.string().optional(),
    // Escape hatch to take the webhook endpoint offline (returns 503) even
    // while WHATSAPP_PROVIDER=META_CLOUD - e.g. mid-setup, before the Meta
    // app's webhook subscription has actually been configured.
    WHATSAPP_WEBHOOK_ENABLED: z
      .string()
      .optional()
      .transform((v) => v !== "false"), // undefined (unset) -> true; only the literal string "false" disables it

    // MAPS_PROVIDER selects which src/integrations/maps/* provider backs
    // geocoding/directions/places. DISABLED (default) means every maps
    // panel renders a clear "not configured" state; Property/Visit CRUD
    // never depend on this. Server key stays server-only; the browser key
    // is intentionally public (must be domain-restricted in Google Cloud).
    MAPS_PROVIDER: z.enum(["GOOGLE", "DISABLED"]).default("DISABLED"),
    GOOGLE_MAPS_SERVER_API_KEY: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY: z.string().optional(),
    GOOGLE_MAPS_MAP_ID: z.string().optional(),
    GOOGLE_MAPS_DEFAULT_REGION: z.string().regex(/^[A-Za-z]{2}$/, "GOOGLE_MAPS_DEFAULT_REGION must be a 2-letter region code").default("IN"),
    GOOGLE_MAPS_DEFAULT_LANGUAGE: z.string().regex(/^[a-z]{2}(-[A-Za-z]{2})?$/, "GOOGLE_MAPS_DEFAULT_LANGUAGE must look like \"en\" or \"en-IN\"").default("en"),
    GOOGLE_MAPS_DEFAULT_CITY: z.string().default("Delhi"),

    // STORAGE_PROVIDER selects which lib/storage/* provider backs the
    // Document Vault and property images. DISABLED (default) means no
    // file storage is configured - upload endpoints fail safely with a
    // clear "not configured" response; existing CRM pages that don't
    // touch files keep working regardless. R2 is the preferred production
    // provider (Cloudflare R2, S3-compatible) - see r2.ts.
    STORAGE_PROVIDER: z.enum(["S3", "R2", "FIREBASE", "DISABLED"]).default("DISABLED"),

    STORAGE_BUCKET: z.string().optional(),
    STORAGE_ACCESS_KEY_ID: z.string().optional(),
    STORAGE_SECRET_ACCESS_KEY: z.string().optional(),

    // Cloudflare R2 (server-only) - required when STORAGE_PROVIDER=R2.
    // Region is always "auto" (never read from env - see r2.ts). Either
    // R2_ACCOUNT_ID (endpoint derived as https://<id>.r2.cloudflarestorage.com)
    // or an explicit R2_ENDPOINT must be present.
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_ENDPOINT: z.string().url("R2_ENDPOINT must be a valid URL").optional(),
    // Left as a plain string (not z.coerce.number()) since env vars are
    // always strings and a coerced schema would accept "" as 0 - validated
    // as a positive integer string in the refine below instead.
    R2_SIGNED_URL_EXPIRY_SECONDS: z.string().regex(/^\d+$/, "R2_SIGNED_URL_EXPIRY_SECONDS must be a positive integer").optional(),
    // Not read anywhere yet - reserved for a future public-asset delivery
    // path (see DEPLOYMENT.md "2.5 Cloudflare R2 storage provider" - Bucket
    // separation). Never used for presigning.
    R2_PUBLIC_BASE_URL: z.string().url("R2_PUBLIC_BASE_URL must be a valid URL").optional(),

    // Firebase Admin SDK (server-only) - required when STORAGE_PROVIDER=FIREBASE.
    // Firebase has never been activated in this deployment (billing was not
    // completed) - kept only as an optional, non-preferred fallback provider.
    FIREBASE_PROJECT_ID: z.string().optional(),
    FIREBASE_CLIENT_EMAIL: z.string().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),
    FIREBASE_STORAGE_BUCKET: z.string().optional(),

    SMTP_HOST: z.string().optional(),
    EMAIL_FROM: z.string().optional(),

    REDIS_URL: z.string().optional(),

    ACRES_99_API_KEY: z.string().optional(),
    MAGICBRICKS_API_KEY: z.string().optional(),

    // Authorizes POST /api/internal/notifications/sweep (Vercel Cron sends
    // `Authorization: Bearer $CRON_SECRET` automatically when this is set -
    // see vercel.json). Left unset, the sweep endpoint refuses all requests
    // rather than running unauthenticated.
    CRON_SECRET: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const isVercelPreview = process.env.VERCEL_ENV === "preview";
    if (!isVercelPreview && !data.NEXTAUTH_URL) {
      ctx.addIssue({ code: "custom", path: ["NEXTAUTH_URL"], message: "NEXTAUTH_URL is required outside Vercel Preview" });
    }
    if (data.WHATSAPP_PROVIDER === "META_CLOUD") {
      for (const key of ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_APP_SECRET"] as const) {
        if (!data[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when WHATSAPP_PROVIDER=META_CLOUD` });
      }
    }
    if (data.MAPS_PROVIDER === "GOOGLE" && !data.GOOGLE_MAPS_SERVER_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["GOOGLE_MAPS_SERVER_API_KEY"], message: "GOOGLE_MAPS_SERVER_API_KEY is required when MAPS_PROVIDER=GOOGLE" });
    }
    if (data.STORAGE_PROVIDER === "S3") {
      const storageFields = [data.STORAGE_BUCKET, data.STORAGE_ACCESS_KEY_ID, data.STORAGE_SECRET_ACCESS_KEY];
      if (!storageFields.every(Boolean)) {
        ctx.addIssue({ code: "custom", path: ["STORAGE_BUCKET"], message: "STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, and STORAGE_SECRET_ACCESS_KEY are all required when STORAGE_PROVIDER=S3" });
      }
    } else {
      // Still flag an inconsistent partial S3 config even when S3 isn't the
      // active provider - a half-set credential trio is almost always a
      // mistake worth surfacing rather than silently ignoring.
      const storageFields = [data.STORAGE_BUCKET, data.STORAGE_ACCESS_KEY_ID, data.STORAGE_SECRET_ACCESS_KEY];
      const storagePartial = storageFields.some(Boolean) && !storageFields.every(Boolean);
      if (storagePartial) {
        ctx.addIssue({ code: "custom", path: ["STORAGE_BUCKET"], message: "STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, and STORAGE_SECRET_ACCESS_KEY must all be set together, or all left empty" });
      }
    }
    if (data.STORAGE_PROVIDER === "R2") {
      for (const key of ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"] as const) {
        if (!data[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when STORAGE_PROVIDER=R2` });
      }
      if (!data.R2_ACCOUNT_ID && !data.R2_ENDPOINT) {
        ctx.addIssue({ code: "custom", path: ["R2_ACCOUNT_ID"], message: "Either R2_ACCOUNT_ID or R2_ENDPOINT is required when STORAGE_PROVIDER=R2" });
      }
    } else {
      // Same "half-set is almost always a mistake" check as S3 above.
      const r2Fields = [data.R2_ACCESS_KEY_ID, data.R2_SECRET_ACCESS_KEY, data.R2_BUCKET_NAME];
      const r2Partial = r2Fields.some(Boolean) && !r2Fields.every(Boolean);
      if (r2Partial) {
        ctx.addIssue({ code: "custom", path: ["R2_BUCKET_NAME"], message: "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME must all be set together, or all left empty" });
      }
    }
    if (data.STORAGE_PROVIDER === "FIREBASE") {
      for (const key of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_STORAGE_BUCKET"] as const) {
        if (!data[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when STORAGE_PROVIDER=FIREBASE` });
      }
    }
    if (process.env.NODE_ENV === "production" && data.NEXTAUTH_URL?.startsWith("http://")) {
      ctx.addIssue({ code: "custom", path: ["NEXTAUTH_URL"], message: "NEXTAUTH_URL must be https:// in production" });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Throws a single aggregated, human-readable error listing every problem found - never partial/silent. */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\n\nSee .env.example for the full variable list.`);
  }
  return result.data;
}
