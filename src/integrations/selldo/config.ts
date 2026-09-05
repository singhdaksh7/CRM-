import "server-only";

/**
 * Sell.Do lead-sync configuration. `SELLDO_API_KEY` was previously shared
 * with this project OUTSIDE of source control and is treated as
 * compromised/needing rotation - its real value is never present anywhere
 * in this repository, this file included; only the env var NAME is
 * referenced, read at call time, never logged.
 */

const DEFAULT_BASE_URL = "https://api.sell.do";

export function getSelldoApiKey(): string | null {
  const value = process.env.SELLDO_API_KEY?.trim();
  return value ? value : null;
}

export function getSelldoSrd(): string | null {
  const value = process.env.SELLDO_SRD?.trim();
  return value ? value : null;
}

/** ASSUMPTION: no Sell.Do base URL is given by the task beyond the relative path "/api/leads/create" - defaults to Sell.Do's conventional API host, overridable for a real/sandbox endpoint. */
export function getSelldoApiBaseUrl(): string {
  return process.env.SELLDO_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

export function isSelldoConfigured(): boolean {
  return Boolean(getSelldoApiKey());
}

export function isSelldoSrdConfigured(): boolean {
  return Boolean(getSelldoSrd());
}

// Fixed tagging per the task - constants, never sourced from a request or env, except SRD itself.
export const SELLDO_CAMPAIGN_NAME = "OLX Lead Generation";
export const SELLDO_SOURCE = "OLX";
export const SELLDO_SUB_SOURCE = "OLX Dealer API";
export const SELLDO_PROJECT = "KP Properties";

export function presence() {
  return {
    apiKeyConfigured: isSelldoConfigured(),
    srdConfigured: isSelldoSrdConfigured(),
  };
}
