"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Select, Input, Textarea, Field } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Mirrors WhatsAppTemplateStatus (server type) - kept as a plain shape here so this client component has no server-only import. */
interface TemplateStatus {
  useCase: string;
  name: string;
  category: "UTILITY" | "MARKETING";
  variables: string[];
  bodyTemplate?: string;
  approved: boolean;
}

const USE_CASE_LABELS: Record<string, string> = {
  VISIT_CONFIRMATION: "Visit Confirmation",
  VISIT_REMINDER: "Visit Reminder",
  FOLLOW_UP_REMINDER: "Reminder",
  CATALOGUE_SHARED: "Property Catalogue",
  PRICE_UPDATED: "Price Update",
  VISIT_RESCHEDULED: "Visit Rescheduled",
  PROPERTY_OPTIONS_SHARED: "New Matching Properties",
  PROPERTY_UNAVAILABLE: "Property Unavailable",
  PAYMENT_REMINDER: "Payment Reminder",
  THANK_YOU: "Thank You",
};

/** camelCase variable name -> the friendlier {{Name}} label the product spec uses, for display only - the underlying positional {{1}},{{2}}... rendering is untouched. */
function friendlyVariableLabel(variable: string): string {
  return variable.charAt(0).toUpperCase() + variable.slice(1).replace(/([A-Z])/g, " $1");
}

function renderBody(bodyTemplate: string, values: string[]): string {
  return values.reduce((body, value, i) => body.split(`{{${i + 1}}}`).join(value || `{{${i + 1}}}`), bodyTemplate);
}

/**
 * Pick a WhatsApp template, fill its variables, preview the rendered text,
 * edit it freely, then hand the final string to `onInsert` - the caller
 * (ConversationPanel) puts it straight into the existing composer textarea,
 * so sending still goes through the one existing send endpoint/provider
 * abstraction (Mock/Click-to-Chat/Meta) unchanged.
 */
export function TemplatePicker({ open, onClose, onInsert, defaultClientName }: { open: boolean; onClose: () => void; onInsert: (text: string, templateName: string) => void; defaultClientName?: string }) {
  const [templates, setTemplates] = useState<TemplateStatus[]>([]);
  const [selected, setSelected] = useState<TemplateStatus | null>(null);
  const [values, setValues] = useState<string[]>([]);
  const [editedBody, setEditedBody] = useState("");
  const [bodyEdited, setBodyEdited] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/whatsapp/templates")
      .then((r) => r.json())
      .then((data) => setTemplates(data.templates.filter((t: TemplateStatus) => t.bodyTemplate)));
  }, [open]);

  function selectTemplate(useCase: string) {
    const template = templates.find((t) => t.useCase === useCase) ?? null;
    setSelected(template);
    setBodyEdited(false);
    if (!template) return;
    setValues(template.variables.map((v) => (v === "clientName" && defaultClientName ? defaultClientName : "")));
  }

  const preview = selected?.bodyTemplate ? renderBody(selected.bodyTemplate, values) : "";
  const displayedBody = bodyEdited ? editedBody : preview;

  function updateValue(i: number, value: string) {
    setValues((prev) => prev.map((v, idx) => (idx === i ? value : v)));
    setBodyEdited(false);
  }

  function insert() {
    if (!selected) return;
    onInsert(displayedBody, selected.name);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Insert WhatsApp template" description="Smart suggestion - fill the variables, preview, then edit freely before sending." wide>
      <div className="space-y-4">
        <Field label="Template">
          <Select value={selected?.useCase ?? ""} onChange={(e) => selectTemplate(e.target.value)}>
            <option value="">Choose a template...</option>
            {templates.map((t) => (
              <option key={t.useCase} value={t.useCase}>
                {USE_CASE_LABELS[t.useCase] ?? t.useCase} {t.approved ? "" : "(not yet approved for Meta)"}
              </option>
            ))}
          </Select>
        </Field>

        {selected && (
          <>
            <div className="flex items-center gap-2">
              <Badge tone={selected.category === "UTILITY" ? "blue" : "purple"}>{selected.category}</Badge>
              {!selected.approved && <Badge tone="amber">Meta approval pending - Mock/Click-to-Chat still work</Badge>}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {selected.variables.map((v, i) => (
                <Field key={v} label={friendlyVariableLabel(v)}>
                  <Input value={values[i] ?? ""} onChange={(e) => updateValue(i, e.target.value)} placeholder={`{{${friendlyVariableLabel(v)}}}`} />
                </Field>
              ))}
            </div>

            <Field label="Preview - editable before sending">
              <Textarea
                rows={4}
                value={displayedBody}
                onChange={(e) => {
                  setEditedBody(e.target.value);
                  setBodyEdited(true);
                }}
              />
            </Field>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={insert} disabled={!displayedBody.trim()}>
                Insert into message
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
