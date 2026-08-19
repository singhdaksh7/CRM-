import { formatINR, timeAgo } from "@/lib/utils";
import type {
  CustomerRequirement,
  DemandMatchReason,
  RecommendationTier,
  RequirementLifecycleStatus,
} from "./types";

/** Default mirrors SystemConfig.requirementStaleAfterDays until config is loaded from the API. */
export const DEFAULT_REQUIREMENT_STALE_AFTER_DAYS = 180;

export function parseLocalities(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
  } catch {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

export function parseTags(raw: string | null | undefined): string[] {
  return parseLocalities(raw);
}

export function parseMatchReasons(raw: string | DemandMatchReason[] | null | undefined): DemandMatchReason[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      if (typeof item === "string") return { label: item, matched: !item.startsWith("⚠"), detail: item };
      return {
        label: String(item.label ?? "Match"),
        matched: Boolean(item.matched),
        detail: String(item.detail ?? item.label ?? ""),
      };
    });
  } catch {
    return [];
  }
}

export function requirementLifecycleStatus(
  requirement: Pick<CustomerRequirement, "active" | "lastConfirmedAt">,
  staleAfterDays = DEFAULT_REQUIREMENT_STALE_AFTER_DAYS,
  now = Date.now()
): RequirementLifecycleStatus {
  if (!requirement.active) return "INACTIVE";
  const confirmedAt = new Date(requirement.lastConfirmedAt).getTime();
  const ageDays = (now - confirmedAt) / (24 * 60 * 60 * 1000);
  if (ageDays > staleAfterDays) return "STALE";
  return "ACTIVE";
}

export function daysSinceConfirmed(lastConfirmedAt: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(lastConfirmedAt).getTime()) / (24 * 60 * 60 * 1000)));
}

export function summarizeRequirement(requirement: Pick<
  CustomerRequirement,
  "assetClass" | "transactionType" | "bhk" | "commercialPropertyType" | "preferredLocalities" | "minBudget" | "maxBudget"
>): string {
  const localities = parseLocalities(requirement.preferredLocalities);
  const locality = localities[0] ?? "Any locality";
  const budget =
    requirement.minBudget != null || requirement.maxBudget != null
      ? `${formatINR(requirement.minBudget, { compact: true })}–${formatINR(requirement.maxBudget, { compact: true })}`
      : "Budget open";

  if (requirement.assetClass === "COMMERCIAL") {
    const subtype = requirement.commercialPropertyType?.replace(/_/g, " ") ?? "Commercial";
    return `${subtype} ${requirement.transactionType} · ${locality} · ${budget}`;
  }

  const bhk = requirement.bhk != null ? `${requirement.bhk}BHK` : "Residential";
  return `${bhk} ${requirement.transactionType} · ${locality} · ${budget}`;
}

export function tierTone(tier: RecommendationTier): "green" | "blue" | "amber" | "slate" {
  switch (tier) {
    case "EXACT":
      return "green";
    case "STRONG":
      return "blue";
    case "STRETCH":
      return "amber";
    default:
      return "slate";
  }
}

export function budgetStretchDisplay(params: {
  customerBudget: number | null | undefined;
  propertyPrice: number | null | undefined;
  stretchThresholdPct: number;
}): { differencePct: number | null; withinThreshold: boolean; label: string } {
  const { customerBudget, propertyPrice, stretchThresholdPct } = params;
  if (customerBudget == null || customerBudget <= 0 || propertyPrice == null) {
    return { differencePct: null, withinThreshold: true, label: "Budget comparison unavailable" };
  }
  const differencePct = ((propertyPrice - customerBudget) / customerBudget) * 100;
  const withinThreshold = differencePct <= stretchThresholdPct * 100;
  const sign = differencePct > 0 ? "+" : "";
  return {
    differencePct,
    withinThreshold,
    label: `Difference: ${sign}${differencePct.toFixed(0)}% · Stretch threshold: ${(stretchThresholdPct * 100).toFixed(0)}%`,
  };
}

export function lastContactedLabel(value: string | null | undefined): string {
  if (!value) return "Never contacted";
  return timeAgo(value);
}

export function contactSafetyWarnings(contact: {
  doNotContact?: boolean;
  whatsAppOptOut?: boolean;
  lastContactedAt?: string | null;
  lastPropertySentAt?: string | null;
  requirementStale?: boolean;
  samePropertyAlreadySent?: boolean;
  recentContactDays?: number;
}): string[] {
  const warnings: string[] = [];
  if (contact.whatsAppOptOut) warnings.push("WhatsApp Opted Out");
  if (contact.doNotContact) warnings.push("Do Not Contact");
  if (contact.lastContactedAt) {
    const days = daysSinceConfirmed(contact.lastContactedAt);
    if (days <= (contact.recentContactDays ?? 1)) warnings.push(`Contacted ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}`);
  }
  if (contact.samePropertyAlreadySent) warnings.push("Same property already sent");
  if (contact.requirementStale) warnings.push("Requirement stale");
  return warnings;
}

export function isRecipientBlocked(contact: {
  doNotContact?: boolean;
  whatsAppOptOut?: boolean;
  status?: string;
}): boolean {
  return Boolean(contact.doNotContact || contact.whatsAppOptOut || contact.status === "DO_NOT_CONTACT");
}
