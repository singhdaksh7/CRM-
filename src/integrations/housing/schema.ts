import { z } from "zod";
import { normalizeIndianPhone } from "@/integrations/whatsapp";

/**
 * Housing lead-push webhook payload contract (Housing -> CRM, inbound only).
 * Housing sends no authentication of its own; every field here is untrusted
 * input and is validated strictly before anything downstream ever sees it.
 * Unknown extra keys are ignored rather than rejected so a future Housing
 * payload addition doesn't turn into a hard outage - the fields below are
 * exactly the documented contract, nothing is inferred beyond it.
 */

const EPOCH_SECONDS_MIN = 946684800; // 2000-01-01T00:00:00Z - anything before this is not a plausible lead timestamp
const EPOCH_SECONDS_MAX_SKEW_SECONDS = 24 * 60 * 60; // tolerate up to 1 day of clock skew into the future

const nullableTrimmedString = z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), z.string().trim().nullable().optional());

export const housingLeadPayloadSchema = z.object({
  lead_date: z
    .number({ invalid_type_error: "lead_date must be an epoch-seconds number" })
    .int()
    .refine((value) => value >= EPOCH_SECONDS_MIN, { message: "lead_date is implausibly old" })
    .refine((value) => value <= Math.floor(Date.now() / 1000) + EPOCH_SECONDS_MAX_SKEW_SECONDS, { message: "lead_date is in the future" }),
  apartment_names: z.string().trim().min(1).max(200),
  country_code: z.string().trim().regex(/^\+?\d{1,3}$/, "country_code must be a 1-3 digit dialing code"),
  service_type: z.string().trim().min(1).max(100),
  category_type: z.string().trim().min(1).max(100),
  locality_name: z.string().trim().min(1).max(200),
  city_name: z.string().trim().min(1).max(200),
  lead_name: z.string().trim().min(1).max(200),
  lead_email: nullableTrimmedString,
  lead_phone: z.string().trim().min(4).max(20),
  project_id: z.union([z.number().int().positive(), z.string().trim().min(1)]),
  project_name: z.string().trim().min(1).max(300),
  property_field: z.array(z.string().trim().min(1).max(100)).max(50),
  max_area: z.number().nonnegative().nullable().optional(),
  min_area: z.number().nonnegative().nullable().optional(),
  min_price: z.number().nonnegative(),
  max_price: z.number().nonnegative(),
}).superRefine((value, ctx) => {
  const digitsCountryCode = value.country_code.replace(/[^\d]/g, "");
  if (!normalizeIndianPhone(value.lead_phone, digitsCountryCode)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lead_phone"], message: "lead_phone is not a plausible phone number for the given country_code" });
  }
  if (value.max_price < value.min_price) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["max_price"], message: "max_price must not be less than min_price" });
  }
  if (value.min_area != null && value.max_area != null && value.max_area < value.min_area) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["max_area"], message: "max_area must not be less than min_area" });
  }
});

export type HousingLeadPayload = z.infer<typeof housingLeadPayloadSchema>;
