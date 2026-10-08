/**
 * Parses the optional BHK query parameter used by Property Inventory.
 * `0` is the residential 1 RK value, so presence must not be tested by
 * truthiness. Only non-negative, base-10 whole numbers are valid filters.
 */
export function parsePropertyBhkFilter(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;

  const bhk = Number(raw);
  return Number.isSafeInteger(bhk) ? bhk : null;
}

/**
 * BHK describes residential configuration. Keep an explicitly selected
 * category unchanged, but ensure an unscoped BHK query cannot include
 * commercial records whose internal BHK value is also zero.
 */
export function resolvePropertyListBhkFilter(params: {
  bhk: string | undefined;
  assetClass: string | undefined;
}) {
  const bhk = params.assetClass === "COMMERCIAL" ? null : parsePropertyBhkFilter(params.bhk);

  return {
    bhk,
    assetClass: bhk !== null && !params.assetClass ? "RESIDENTIAL" : params.assetClass,
  };
}

/** Asset-class + BHK `where` fragment for the total-count query; mirrors listAvailablePropertiesPage. */
export function propertyListBhkWhere(filters: { bhk: number | null; assetClass: string | undefined }) {
  return {
    ...(filters.assetClass ? { assetClass: filters.assetClass } : {}),
    ...(filters.bhk !== null ? { bhk: filters.bhk } : {}),
  };
}
