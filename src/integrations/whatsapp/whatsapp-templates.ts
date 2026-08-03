import { WhatsAppConfigError } from "./whatsapp-errors";

/**
 * Template registry for the six use cases this CRM sends outside the
 * 24-hour customer-service window (see whatsapp-window.ts). Meta requires
 * every template to be pre-submitted and approved in Meta Business Manager
 * before it can be sent - this registry is the single place that tracks
 * what this app *thinks* each template's real Meta name/language/variables
 * are, but approval itself is never assumed. A template only counts as
 * "approved" here when its exact Meta template name appears in the
 * WHATSAPP_APPROVED_TEMPLATE_NAMES env var (comma-separated) - something
 * only an operator can set, after actually checking Meta Business Manager.
 * There is no live Meta credential in this environment, so nothing here is
 * marked approved by default.
 */
export type WhatsAppTemplateUseCase =
  | "VISIT_CONFIRMATION"
  | "VISIT_REMINDER"
  | "FOLLOW_UP_REMINDER"
  | "CATALOGUE_SHARED"
  | "PRICE_UPDATED"
  | "VISIT_RESCHEDULED";

export interface WhatsAppTemplateDefinition {
  useCase: WhatsAppTemplateUseCase;
  /** The exact template name as registered (or to be registered) in Meta Business Manager. Overridable per use case via WHATSAPP_TEMPLATE_NAME_<USE_CASE>. */
  name: string;
  languageCode: string;
  category: "UTILITY" | "MARKETING";
  /** Ordered list of {{1}}, {{2}}, ... body variable names, for documentation/validation only. */
  variables: string[];
}

const DEFAULT_TEMPLATES: WhatsAppTemplateDefinition[] = [
  { useCase: "VISIT_CONFIRMATION", name: "visit_confirmation", languageCode: "en", category: "UTILITY", variables: ["clientName", "propertyTitle", "visitDate", "visitTime"] },
  { useCase: "VISIT_REMINDER", name: "visit_reminder", languageCode: "en", category: "UTILITY", variables: ["clientName", "propertyTitle", "visitTime"] },
  { useCase: "FOLLOW_UP_REMINDER", name: "follow_up_reminder", languageCode: "en", category: "UTILITY", variables: ["clientName", "agentName"] },
  { useCase: "CATALOGUE_SHARED", name: "catalogue_shared", languageCode: "en", category: "MARKETING", variables: ["clientName", "propertyCount", "catalogueUrl"] },
  { useCase: "PRICE_UPDATED", name: "price_updated", languageCode: "en", category: "UTILITY", variables: ["clientName", "propertyTitle", "newPrice"] },
  { useCase: "VISIT_RESCHEDULED", name: "visit_rescheduled", languageCode: "en", category: "UTILITY", variables: ["clientName", "propertyTitle", "newVisitDate", "newVisitTime"] },
];

function envOverrideName(useCase: WhatsAppTemplateUseCase): string | undefined {
  return process.env[`WHATSAPP_TEMPLATE_NAME_${useCase}`];
}

function approvedNames(): Set<string> {
  const raw = process.env.WHATSAPP_APPROVED_TEMPLATE_NAMES ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export interface WhatsAppTemplateStatus extends WhatsAppTemplateDefinition {
  approved: boolean;
}

/** Full registry with the effective (env-overridable) name and live approval state - used by the Settings UI template list and the health endpoint. */
export function listWhatsAppTemplates(): WhatsAppTemplateStatus[] {
  const approved = approvedNames();
  return DEFAULT_TEMPLATES.map((t) => {
    const name = envOverrideName(t.useCase) ?? t.name;
    return { ...t, name, approved: approved.has(name) };
  });
}

export function getWhatsAppTemplate(useCase: WhatsAppTemplateUseCase): WhatsAppTemplateStatus {
  const template = listWhatsAppTemplates().find((t) => t.useCase === useCase);
  if (!template) throw new WhatsAppConfigError(`Unknown WhatsApp template use case "${useCase}"`);
  return template;
}

/**
 * Looks a template up by its exact Meta name (not use case) - used when a
 * caller supplies a raw template name (e.g. an ad hoc/manual send) rather
 * than a known use case.
 */
export function findWhatsAppTemplateByName(name: string): WhatsAppTemplateStatus | undefined {
  return listWhatsAppTemplates().find((t) => t.name === name);
}

/**
 * Blocks sending unless the named template is both registered here and
 * confirmed approved via WHATSAPP_APPROVED_TEMPLATE_NAMES. Never silently
 * falls back to a free-form message - the caller must surface this as a
 * clear configuration error.
 */
export function assertTemplateApproved(name: string): WhatsAppTemplateStatus {
  const template = findWhatsAppTemplateByName(name);
  if (!template) {
    throw new WhatsAppConfigError(
      `"${name}" is not a registered WhatsApp template. Add it to the registry (whatsapp-templates.ts) and set WHATSAPP_APPROVED_TEMPLATE_NAMES once Meta has approved it.`
    );
  }
  if (!template.approved) {
    throw new WhatsAppConfigError(
      `WhatsApp template "${name}" has not been confirmed approved (set WHATSAPP_APPROVED_TEMPLATE_NAMES once Meta Business Manager shows it as Approved). Refusing to send an unapproved template.`
    );
  }
  return template;
}
