import "server-only";
import { logger } from "@/lib/logger";
import { getSelldoApiKey, getSelldoApiBaseUrl, getSelldoSrd, SELLDO_CAMPAIGN_NAME, SELLDO_SOURCE, SELLDO_SUB_SOURCE, SELLDO_PROJECT } from "./config";

/**
 * Sell.Do lead-create client. Server-only; the API key never reaches the
 * browser. Builds the documented `sell_do[form][lead][...]` / `sell_do[campaign][srd]`
 * field set via URLSearchParams (never hand-concatenated).
 *
 * ASSUMPTION (no full Sell.Do API doc was supplied, only the field-name
 * fragment in the task): the campaign/source/sub-source/project tags use the
 * field names `sell_do[campaign][name]`, `sell_do[campaign][source]`,
 * `sell_do[campaign][sub_source]`, `sell_do[campaign][project]` alongside
 * the task's own `sell_do[campaign][srd]`; the API key is sent as a
 * `secret_key` query parameter, matching Sell.Do's commonly documented lead
 * capture convention. If the real integration doc specifies different field
 * or auth-parameter names, this file is the only place that needs to change.
 */

export interface SelldoLeadInput {
  name: string;
  email?: string | null;
  phone: string;
  /** Rendered exactly as-is - callers must never include GPS, exact address, internal notes, credentials or tokens. */
  note: string;
}

export type SelldoSyncOutcome =
  | { ok: true; status: number }
  | { ok: false; reason: "NOT_CONFIGURED" | "SRD_NOT_CONFIGURED" }
  | { ok: false; reason: "API_ERROR"; status: number }
  | { ok: false; reason: "NETWORK_ERROR"; message: string };

export async function createSelldoLead(input: SelldoLeadInput): Promise<SelldoSyncOutcome> {
  const apiKey = getSelldoApiKey();
  if (!apiKey) {
    logger.warn("selldo_sync_skipped_not_configured");
    return { ok: false, reason: "NOT_CONFIGURED" };
  }
  const srd = getSelldoSrd();
  if (!srd) {
    logger.warn("selldo_sync_skipped_srd_not_configured");
    return { ok: false, reason: "SRD_NOT_CONFIGURED" };
  }

  const body = new URLSearchParams();
  body.set("sell_do[form][lead][name]", input.name);
  if (input.email) body.set("sell_do[form][lead][email]", input.email);
  body.set("sell_do[form][lead][phone]", input.phone);
  body.set("sell_do[campaign][srd]", srd);
  body.set("sell_do[campaign][name]", SELLDO_CAMPAIGN_NAME);
  body.set("sell_do[campaign][source]", SELLDO_SOURCE);
  body.set("sell_do[campaign][sub_source]", SELLDO_SUB_SOURCE);
  body.set("sell_do[campaign][project]", SELLDO_PROJECT);
  body.set("sell_do[form][content][note]", input.note);

  const url = new URL("/api/leads/create", getSelldoApiBaseUrl());
  url.searchParams.set("secret_key", apiKey);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      logger.error("selldo_sync_api_error", { status: response.status });
      return { ok: false, reason: "API_ERROR", status: response.status };
    }
    return { ok: true, status: response.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("selldo_sync_network_error", { message });
    return { ok: false, reason: "NETWORK_ERROR", message };
  }
}
