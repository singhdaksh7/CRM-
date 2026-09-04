import { z } from "zod";

/**
 * OLX Dealer Lead Sharing API - payload contracts.
 *
 * IMPORTANT - ASSUMPTION FLAG: no OLX SOP document was actually supplied to
 * this implementation. The task description gives the endpoint contract
 * (base URL, auth headers/response fields, lead-fetch query params, the two
 * field lists "OLX lead fields" and "OLX ad data") but does NOT give:
 *   1. the login request body shape,
 *   2. the leads-fetch response envelope/pagination shape, or
 *   3. how/whether "ad data" (id/title/desc/price/lat/long/parameters) is
 *      actually delivered - as a field embedded per-lead, or via a separate
 *      undocumented ad-lookup endpoint.
 * Every place below that fills that gap is marked "ASSUMPTION" and is the
 * single place to change once the real OLX SOP/response samples are
 * available. Everything else (base URL, header names, token field names,
 * lead field names, 7-day/100-row constraints) is taken verbatim from the
 * task's endpoint contract.
 */

// ---- Auth --------------------------------------------------------------

/** ASSUMPTION: request body field names for POST /api/v1/auth/login. */
export const olxLoginRequestSchema = z.object({
  username: z.string().min(1),
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
 * ASSUMPTION: OLX ad data (id/title/desc/price/lat/long/parameters) is
 * embedded per-lead in the leads-fetch response as an `ad` object, since no
 * separate ad-lookup endpoint is documented anywhere in the task's contract.
 * `parameters` is treated as an opaque bag of provider-defined key/value
 * pairs (OLX ad attribute schemas vary by category) and is never trusted
 * beyond best-effort locality/asset-class/transaction-type inference - see
 * adapter.ts.
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
  ad: olxAdSnapshotSchema.nullish(),
});
export type OlxLeadPayload = z.infer<typeof olxLeadSchema>;

/**
 * ASSUMPTION: envelope shape for GET /api/v1/leads. Accepts `leads` (also
 * tolerates `data`/`items` as an alias, in case the real response differs)
 * plus optional pagination metadata used only as a hint - fetchAllLeads()
 * in client.ts does not depend on any specific field name being present and
 * instead paginates by "did this page come back full" (see client.ts).
 */
export const olxLeadsResponseSchema = z.object({
  leads: z.array(z.unknown()).optional(),
  data: z.array(z.unknown()).optional(),
  items: z.array(z.unknown()).optional(),
  page: z.number().int().nonnegative().optional(),
  pageSize: z.number().int().positive().optional(),
  totalCount: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
});
export type OlxLeadsResponse = z.infer<typeof olxLeadsResponseSchema>;
