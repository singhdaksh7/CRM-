import { z } from "zod";

/**
 * OLX Dealer Lead Sharing API - payload contracts.
 *
 * IMPORTANT - ASSUMPTION FLAG: no OLX SOP document was actually supplied to
 * this implementation. The task description gives the endpoint contract
 * (base URL, auth headers/response fields, lead-fetch query params, and two
 * SEPARATE field lists - "OLX lead fields" (name/phoneNumber/emailId/date/adId)
 * and "OLX ad data" (id/title/desc/price/lat/long/parameters)) but does NOT
 * give:
 *   1. the login request body shape, or
 *   2. the exact response envelope shape.
 * Per the documented contract, leads and ads are two separate lists,
 * correlated by `lead.adId === ad.id` - NOT one lead object with an embedded
 * `ad` field. This file models that correlation explicitly (see
 * `olxLeadsResponseSchema`'s separate `leads`/`ads` arrays); `client.ts`
 * builds the `adId -> ad` lookup and `adapter.ts` accepts the correlated ad
 * as an optional second argument rather than reading it off the lead. Every
 * place below that fills a genuine gap is marked "ASSUMPTION" and is the
 * single place to change once the real OLX SOP/response samples are
 * available. Everything else (base URL, header names, token field names,
 * lead/ad field names, 7-day/100-row constraints) is taken verbatim from the
 * task's endpoint contract.
 */

// ---- Auth --------------------------------------------------------------

/** Official OLX Dealer Lead Sharing API login request contract. */
export const olxLoginRequestSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});
export type OlxLoginRequest = z.infer<typeof olxLoginRequestSchema>;

/** Given verbatim by the task: access_token, refresh_token, user_id. */
export const olxLoginResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  user_id: z.union([z.string(), z.number()]),
});
export type OlxLoginResponse = z.infer<typeof olxLoginResponseSchema>;

// ---- Ad snapshot ---------------------------------------------------------

/**
 * "OLX ad data" per the task's documented field list: id/title/desc/price/
 * lat/long/parameters. Delivered as its own list item (see
 * `olxLeadsResponseSchema`'s `ads` array), correlated to a lead by
 * `id === lead.adId` - never embedded on the lead itself. `parameters` is
 * treated as an opaque bag of provider-defined key/value pairs (OLX ad
 * attribute schemas vary by category) and is never trusted beyond
 * best-effort locality/asset-class/transaction-type inference - see
 * adapter.ts. Nothing beyond this documented field list is invented.
 */
export const olxAdSnapshotSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string().trim().max(300).nullish(),
  desc: z.string().trim().max(5000).nullish(),
  price: z.number().nonnegative().nullish(),
  lat: z.number().nullish(),
  long: z.number().nullish(),
  parameters: z.record(z.string(), z.unknown()).nullish(),
});
export type OlxAdSnapshot = z.infer<typeof olxAdSnapshotSchema>;

// ---- Lead ------------------------------------------------------------

const DDMMYY = /^([0-3]?\d)\/([0-1]?\d)\/(\d{2}|\d{4})$/;

/** "OLX lead fields" per the task, verbatim: name, phoneNumber, emailId, date, adId. No embedded ad object. */
export const olxLeadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phoneNumber: z.string().trim().min(4).max(20),
  // Documented as nullable by the task.
  emailId: z.string().trim().email().max(200).nullable().optional(),
  // "OLX lead dates are DD/MM/YY" per the task; validated strictly here,
  // parsed unambiguously in adapter.ts (parseOlxLeadDate).
  date: z.string().trim().regex(DDMMYY, "date must be DD/MM/YY"),
  adId: z.union([z.string(), z.number()]),
  // ASSUMPTION: if OLX's response carries its own stable per-lead
  // identifier it is preferred over a derived hash (see Part F of the
  // task) - accepted here as an optional field under either common name.
  leadId: z.union([z.string(), z.number()]).nullish(),
  id: z.union([z.string(), z.number()]).nullish(),
});
export type OlxLeadPayload = z.infer<typeof olxLeadSchema>;

/**
 * Official OLX Dealer Lead Sharing API response envelope. Leads and ads are
 * separate, correlated lists at `data.leads` and `data.ads`; pagination is
 * supplied alongside them at `data.pagination`.
 */
export const olxLeadsResponseSchema = z.object({
  status: z.string(),
  code: z.number(),
  data: z.object({
    leads: z.array(z.unknown()),
    ads: z.array(z.unknown()),
    pagination: z.object({
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      totalPages: z.number().int().nonnegative(),
      totalRecords: z.number().int().nonnegative(),
    }),
  }),
});
export type OlxLeadsResponse = z.infer<typeof olxLeadsResponseSchema>;
