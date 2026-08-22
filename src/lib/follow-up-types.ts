import type { FollowUpType } from "@prisma/client";

/**
 * simplified-role-workflow (targeted fix pass, Blocker D) - the single
 * source of the 4 human-facing follow-up types shown in every DM/FE-facing
 * "Add Follow-up" UI: the lead workspace's primary follow-up form
 * (src/components/leads/lead-workspace.tsx) and the visit-completion
 * "Next Action?" follow-up form
 * (src/components/visits/visit-property-workflow.tsx) both import this
 * instead of each hardcoding their own copy of the same 4 options.
 *
 * This intentionally does NOT list every FollowUpType in the Prisma enum -
 * PROPERTY_SHARING / VISIT_CONFIRMATION / NEGOTIATION / DOCUMENTATION /
 * PAYMENT_REMINDER remain valid, storable, backend-supported values (other
 * workflows - e.g. automation rules, historical data - may still produce
 * them, and the follow-up HISTORY list still displays them via the generic
 * enumToLabel() humanizer), they are just never offered as a choice in the
 * normal DM/FE "Add Follow-up" form. Pure and dependency-free so it can be
 * imported from both server and client components.
 */
export const HUMAN_FOLLOWUP_TYPES: { value: FollowUpType; label: string }[] = [
  { value: "PHONE_CALL", label: "Call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "VISIT_EXPECTED", label: "Customer Expected / Coming" },
  { value: "GENERAL_FOLLOW_UP", label: "General Follow-up" },
];

export const DEFAULT_FOLLOWUP_TYPE: FollowUpType = "PHONE_CALL";
