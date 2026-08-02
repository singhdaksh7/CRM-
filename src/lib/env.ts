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
    NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
    NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL"),

    WHATSAPP_PROVIDER: z.enum(["MOCK", "CLICK_TO_CHAT", "META_CLOUD"]).default("MOCK"),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),

    STORAGE_BUCKET: z.string().optional(),
    STORAGE_ACCESS_KEY_ID: z.string().optional(),
    STORAGE_SECRET_ACCESS_KEY: z.string().optional(),

    SMTP_HOST: z.string().optional(),
    EMAIL_FROM: z.string().optional(),

    REDIS_URL: z.string().optional(),

    ACRES_99_API_KEY: z.string().optional(),
    MAGICBRICKS_API_KEY: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.WHATSAPP_PROVIDER === "META_CLOUD") {
      for (const key of ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"] as const) {
        if (!data[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when WHATSAPP_PROVIDER=META_CLOUD` });
      }
    }
    const storageFields = [data.STORAGE_BUCKET, data.STORAGE_ACCESS_KEY_ID, data.STORAGE_SECRET_ACCESS_KEY];
    const storagePartial = storageFields.some(Boolean) && !storageFields.every(Boolean);
    if (storagePartial) {
      ctx.addIssue({ code: "custom", path: ["STORAGE_BUCKET"], message: "STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, and STORAGE_SECRET_ACCESS_KEY must all be set together, or all left empty" });
    }
    if (process.env.NODE_ENV === "production" && data.NEXTAUTH_URL.startsWith("http://")) {
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
