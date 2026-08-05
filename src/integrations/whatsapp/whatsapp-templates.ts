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
  | "VISIT_RESCHEDULED"
  | "PROPERTY_OPTIONS_SHARED"
  // Phase 2 - Smart Search & Productivity: the three use cases from the
  // original seven that had no equivalent (Property Catalogue = CATALOGUE_SHARED,
  // Visit Confirmation/Reminder, New Matching Properties = PROPERTY_OPTIONS_SHARED,
  // and Reminder = FOLLOW_UP_REMINDER already existed and are reused as-is).
  | "PROPERTY_UNAVAILABLE"
  | "PAYMENT_REMINDER"
  | "THANK_YOU";

export interface WhatsAppTemplateDefinition {
  useCase: WhatsAppTemplateUseCase;
  /** The exact template name as registered (or to be registered) in Meta Business Manager. Overridable per use case via WHATSAPP_TEMPLATE_NAME_<USE_CASE>. */
  name: string;
  languageCode: string;
  category: "UTILITY" | "MARKETING";
  /** Ordered list of {{1}}, {{2}}, ... body variable names, for documentation/validation only. */
  variables: string[];
  /** Optional {{1}}, {{2}}, ... body pattern this app can render locally for use cases that build their own outbound text (see renderTemplateBody). Documentation-only for use cases that don't. */
  bodyTemplate?: string;
}

const DEFAULT_TEMPLATES: WhatsAppTemplateDefinition[] = [
  { useCase: "VISIT_CONFIRMATION", name: "visit_confirmation", languageCode: "en", category: "UTILITY", variables: ["clientName", "propertyTitle", "visitDate", "visitTime"] },
  { useCase: "VISIT_REMINDER", name: "visit_reminder", languageCode: "en", category: "UTILITY", variables: ["clientName", "propertyTitle", "visitTime"] },
  { useCase: "FOLLOW_UP_REMINDER", name: "follow_up_reminder", languageCode: "en", category: "UTILITY", variables: ["clientName", "agentName"] },
  { useCase: "CATALOGUE_SHARED", name: "catalogue_shared", languageCode: "en", category: "MARKETING", variables: ["clientName", "propertyCount", "catalogueUrl"] },
  { useCase: "PRICE_UPDATED", name: "price_updated", languageCode: "en", category: "UTILITY", variables: ["clientName", "propertyTitle", "newPrice"] },
  { useCase: "VISIT_RESCHEDULED", name: "visit_rescheduled", languageCode: "en", category: "UTILITY", variables: ["clientName", "propertyTitle", "newVisitDate", "newVisitTime"] },
  {
    useCase: "PROPERTY_OPTIONS_SHARED",
    name: "property_options_shared",
    languageCode: "en",
    category: "MARKETING",
    variables: ["clientName", "propertyCount", "requirementSummary", "preferredLocation", "catalogueUrl"],
    bodyTemplate: "Hello {{1}},\n\nWe have shortlisted {{2}} properties matching your requirement for {{3}} in {{4}}.\n\nView the available options here:\n{{5}}\n\nReply to this message if you would like to schedule a visit.",
  },
  {
    useCase: "PROPERTY_UNAVAILABLE",
    name: "property_unavailable",
    languageCode: "en",
    category: "UTILITY",
    variables: ["clientName", "propertyTitle"],
    bodyTemplate: "Hi {{1}}, we wanted to let you know that {{2}} is no longer available. We will share similar options shortly.",
  },
  {
    useCase: "PAYMENT_REMINDER",
    name: "payment_reminder",
    languageCode: "en",
    category: "UTILITY",
    variables: ["clientName", "amount", "dueDate"],
    bodyTemplate: "Hi {{1}}, this is a reminder that a payment of {{2}} is due on {{3}}. Please let us know if you have any questions.",
  },
  {
    useCase: "THANK_YOU",
    name: "thank_you",
    languageCode: "en",
    category: "UTILITY",
    variables: ["clientName", "employeeName"],
    bodyTemplate: "Thank you {{1}} for choosing us. {{2}} will be in touch if you need any further assistance.",
  },
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
/**
 * Substitutes {{1}}, {{2}}, ... in a use case's registered `bodyTemplate`
 * with the given values, in order - used for use cases (like
 * PROPERTY_OPTIONS_SHARED) whose outbound text this app builds itself
 * rather than relying on Meta's server-side template rendering. Throws if
 * the use case has no `bodyTemplate` registered, so a misconfiguration is
 * never silently swallowed into a blank/garbled message.
 */
export function renderTemplateBody(useCase: WhatsAppTemplateUseCase, values: string[]): string {
  const template = getWhatsAppTemplate(useCase);
  if (!template.bodyTemplate) {
    throw new WhatsAppConfigError(`Template "${template.name}" (use case "${useCase}") has no registered body pattern to render.`);
  }
  return values.reduce((body, value, i) => body.split(`{{${i + 1}}}`).join(value), template.bodyTemplate);
}

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
