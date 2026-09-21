import { formatIndianNumber } from "@/lib/utils";

/**
 * Centralized Indian-money conversion helpers.
 *
 * The database always stores money (Property.monthlyRent / salePrice,
 * Lead.minBudget / maxBudget, LeadRequirement.minBudget / maxBudget, ...) as
 * a plain integer number of rupees. This module is the ONLY place that
 * converts between that raw-rupee integer and the human-friendly
 * Thousand/Lakh/Crore units staff actually type into forms. Every form or
 * display that needs this conversion must import from here rather than
 * re-implementing the multiplier math, so the rounding behavior stays
 * consistent everywhere.
 */

export type MoneyUnit = "thousand" | "lakh" | "crore";

/** 1 Thousand = 1,000 INR, 1 Lakh = 100,000 INR, 1 Crore = 10,000,000 INR. */
export const UNIT_TO_INR: Record<MoneyUnit, number> = {
  thousand: 1_000,
  lakh: 100_000,
  crore: 10_000_000,
};

export const UNIT_LABELS: Record<MoneyUnit, string> = {
  thousand: "Thousand",
  lakh: "Lakh",
  crore: "Crore",
};

/**
 * Converts a human-entered amount (e.g. "1.5" Crore) into whole rupees.
 * Rounds to the nearest whole rupee and avoids the float drift that a plain
 * `amount * multiplier` can produce (e.g. 1.2 * 100000 === 120000.00000000001
 * in IEEE754) by snapping the input to 6 decimal places before scaling.
 */
export function toINR(amount: number, unit: MoneyUnit): number {
  if (!Number.isFinite(amount)) return 0;
  const multiplier = UNIT_TO_INR[unit];
  const safeAmount = Number(amount.toFixed(6));
  return Math.round(safeAmount * multiplier);
}

/**
 * Reverse of toINR: expresses a whole-rupee amount in the given unit, for
 * pre-filling a form input. Not rounded to whole numbers - the caller
 * decides how many decimals to display.
 */
export function fromINR(inr: number, unit: MoneyUnit): number {
  if (!Number.isFinite(inr)) return 0;
  const multiplier = UNIT_TO_INR[unit];
  // Round to a sane number of decimals (6) to avoid noisy float tails like
  // 1.2000000000000002 when the division doesn't come out even.
  return Math.round((inr / multiplier) * 1_000_000) / 1_000_000;
}

/**
 * Which units a listing type is allowed to be entered in.
 * RENT: Thousand/Lakh (monthly rents rarely reach a Crore).
 * SALE: Lakh/Crore (sale prices are rarely usefully expressed in Thousands).
 */
export function allowedUnitsForListingType(listingType: "RENT" | "SALE"): MoneyUnit[] {
  return listingType === "RENT" ? ["thousand", "lakh"] : ["lakh", "crore"];
}

/**
 * Picks a sensible default unit to display an existing INR value in, from
 * the allowed units for its listing type. Prefers the largest allowed unit
 * that the value is at least 1 of, falling back to the smallest allowed
 * unit for small values.
 */
export function pickDefaultUnit(inr: number | null | undefined, allowedUnits: MoneyUnit[]): MoneyUnit {
  if (inr == null || !Number.isFinite(inr) || allowedUnits.length === 0) return allowedUnits[0] ?? "lakh";
  const sorted = [...allowedUnits].sort((a, b) => UNIT_TO_INR[b] - UNIT_TO_INR[a]);
  for (const unit of sorted) {
    if (Math.abs(inr) >= UNIT_TO_INR[unit]) return unit;
  }
  return sorted[sorted.length - 1];
}

/**
 * Formats a whole-rupee amount for display, automatically picking the
 * largest unit that reads cleanly: "₹1.5 Crore", "₹75 Lakh", "₹35 Thousand".
 * Falls back to plain Indian-grouped rupees below ₹1,000.
 */
export function formatIndianMoney(inr: number | null | undefined): string {
  if (inr == null || !Number.isFinite(inr)) return "-";
  const abs = Math.abs(inr);
  const trim = (n: number) => (Math.round(n * 100) / 100).toString();
  if (abs >= UNIT_TO_INR.crore) return `₹${trim(inr / UNIT_TO_INR.crore)} Crore`;
  if (abs >= UNIT_TO_INR.lakh) return `₹${trim(inr / UNIT_TO_INR.lakh)} Lakh`;
  if (abs >= UNIT_TO_INR.thousand) return `₹${trim(inr / UNIT_TO_INR.thousand)} Thousand`;
  return `₹${formatIndianNumber(inr)}`;
}
